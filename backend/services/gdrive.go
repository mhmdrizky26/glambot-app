package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"os"
	"path/filepath"
	"photobooth/config"
	"strings"
	"time"

	"golang.org/x/oauth2"
)

// Integrasi Google Drive: upload semua aset hasil sesi (strip framed, GIF,
// foto mentah) ke satu folder per-sesi di Drive akun Gmail, lalu folder
// di-share "anyone with link → reader". Link folder inilah yang dipakai untuk
// QR di halaman download — bisa dibuka dari mana saja, tidak bergantung LAN.
//
// Auth: OAuth2 refresh-token milik akun Gmail (lihat cmd/gdrive-token untuk
// mengambil refresh token sekali consent). Scope minimal `drive.file` — app
// hanya bisa melihat/mengubah file yang ia buat sendiri.

const (
	driveAPIBase    = "https://www.googleapis.com/drive/v3"
	driveUploadBase = "https://www.googleapis.com/upload/drive/v3"
	driveFolderMIME = "application/vnd.google-apps.folder"
)

// DriveUpload satu file lokal yang akan diunggah, beserta nama tampil di Drive.
type DriveUpload struct {
	LocalPath string // path absolut file di disk
	Name      string // nama file yang tampil di Drive
}

// DriveResult ringkasan hasil upload sesi.
type DriveResult struct {
	FolderID    string
	WebViewLink string
}

// IsDriveEnabled true kalau kredensial OAuth Drive lengkap di config.
func IsDriveEnabled() bool {
	c := config.App
	return c != nil &&
		c.GoogleClientID != "" &&
		c.GoogleClientSecret != "" &&
		c.GoogleRefreshToken != ""
}

// driveOAuthConfig membangun oauth2.Config untuk endpoint Google. Sengaja tidak
// memakai golang.org/x/oauth2/google supaya dependensi tetap ringan — kita
// hanya butuh token URL Google.
func driveOAuthConfig() *oauth2.Config {
	return &oauth2.Config{
		ClientID:     config.App.GoogleClientID,
		ClientSecret: config.App.GoogleClientSecret,
		Endpoint: oauth2.Endpoint{
			AuthURL:  "https://accounts.google.com/o/oauth2/auth",
			TokenURL: "https://oauth2.googleapis.com/token",
		},
		// drive.file: akses hanya ke file yang dibuat aplikasi ini.
		Scopes: []string{"https://www.googleapis.com/auth/drive.file"},
	}
}

// driveClient mengembalikan *http.Client yang otomatis me-refresh access token
// dari refresh token (tidak ada access token awal → di-refresh saat dipakai).
func driveClient(ctx context.Context) *http.Client {
	conf := driveOAuthConfig()
	tok := &oauth2.Token{RefreshToken: config.App.GoogleRefreshToken}
	return conf.Client(ctx, tok)
}

// UploadSessionAssets membuat folder per-sesi di Drive, mengunggah semua file,
// lalu membuat folder publik (anyone with link → reader). Mengembalikan
// folder ID + webViewLink yang siap dipakai untuk QR.
func UploadSessionAssets(ctx context.Context, folderName string, files []DriveUpload) (DriveResult, error) {
	var res DriveResult
	if !IsDriveEnabled() {
		return res, fmt.Errorf("google drive belum dikonfigurasi")
	}
	if len(files) == 0 {
		return res, fmt.Errorf("tidak ada file untuk diunggah")
	}

	client := driveClient(ctx)

	folderID, link, err := createDriveFolder(ctx, client, folderName, config.App.GoogleDriveFolderID)
	if err != nil {
		return res, fmt.Errorf("gagal membuat folder Drive: %w", err)
	}

	// Share folder: anyone with link → reader. File di dalamnya mewarisi izin.
	if err := setAnyoneReader(ctx, client, folderID); err != nil {
		return res, fmt.Errorf("gagal share folder Drive: %w", err)
	}

	for _, f := range files {
		if _, err := uploadDriveFile(ctx, client, folderID, f); err != nil {
			// Satu file gagal tidak membatalkan keseluruhan; lanjut file lain
			// supaya customer tetap dapat sebagian besar aset.
			fmt.Printf("⚠️  drive upload gagal (%s): %v\n", f.Name, err)
			continue
		}
	}

	res.FolderID = folderID
	res.WebViewLink = link
	return res, nil
}

// createDriveFolder membuat folder. parentID boleh kosong (folder dibuat di
// root My Drive akun).
func createDriveFolder(ctx context.Context, client *http.Client, name, parentID string) (id, webViewLink string, err error) {
	meta := map[string]interface{}{
		"name":     name,
		"mimeType": driveFolderMIME,
	}
	if parentID != "" {
		meta["parents"] = []string{parentID}
	}
	body, _ := json.Marshal(meta)

	url := driveAPIBase + "/files?fields=id,webViewLink&supportsAllDrives=true"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", "", err
	}
	req.Header.Set("Content-Type", "application/json")

	var out struct {
		ID          string `json:"id"`
		WebViewLink string `json:"webViewLink"`
	}
	if err := doDriveJSON(client, req, &out); err != nil {
		return "", "", err
	}
	return out.ID, out.WebViewLink, nil
}

// setAnyoneReader memberi izin baca publik (anyone with link) ke sebuah file/
// folder Drive.
func setAnyoneReader(ctx context.Context, client *http.Client, fileID string) error {
	body, _ := json.Marshal(map[string]string{
		"role": "reader",
		"type": "anyone",
	})
	url := fmt.Sprintf("%s/files/%s/permissions?supportsAllDrives=true", driveAPIBase, fileID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	return doDriveJSON(client, req, nil)
}

// uploadDriveFile mengunggah satu file lokal ke folder Drive via multipart
// upload (metadata + konten dalam satu request).
func uploadDriveFile(ctx context.Context, client *http.Client, parentID string, f DriveUpload) (string, error) {
	src, err := os.Open(f.LocalPath)
	if err != nil {
		return "", err
	}
	defer src.Close()

	mimeType := mime.TypeByExtension(strings.ToLower(filepath.Ext(f.Name)))
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}

	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)

	// Part 1: metadata JSON.
	metaHeader := textproto.MIMEHeader{}
	metaHeader.Set("Content-Type", "application/json; charset=UTF-8")
	metaPart, err := mw.CreatePart(metaHeader)
	if err != nil {
		return "", err
	}
	meta := map[string]interface{}{
		"name":    f.Name,
		"parents": []string{parentID},
	}
	if err := json.NewEncoder(metaPart).Encode(meta); err != nil {
		return "", err
	}

	// Part 2: konten file.
	contentHeader := textproto.MIMEHeader{}
	contentHeader.Set("Content-Type", mimeType)
	contentPart, err := mw.CreatePart(contentHeader)
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(contentPart, src); err != nil {
		return "", err
	}
	if err := mw.Close(); err != nil {
		return "", err
	}

	url := driveUploadBase + "/files?uploadType=multipart&fields=id&supportsAllDrives=true"
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, &buf)
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "multipart/related; boundary="+mw.Boundary())

	var out struct {
		ID string `json:"id"`
	}
	if err := doDriveJSON(client, req, &out); err != nil {
		return "", err
	}
	return out.ID, nil
}

// doDriveJSON menjalankan request, memeriksa status, dan men-decode body JSON
// ke `out` (boleh nil kalau respons tidak dipakai).
func doDriveJSON(client *http.Client, req *http.Request, out interface{}) error {
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	data, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("drive API %s: %s", resp.Status, strings.TrimSpace(string(data)))
	}
	if out == nil {
		return nil
	}
	if len(data) == 0 {
		return nil
	}
	return json.Unmarshal(data, out)
}

// DeleteDriveFolder menghapus folder sesi (beserta isinya) dari Drive. Dipakai
// saat cleanup sesi expired supaya storage Drive tidak menumpuk. Folder yang
// sudah tidak ada (404) dianggap sukses — idempoten terhadap cleanup berulang.
func DeleteDriveFolder(ctx context.Context, folderID string) error {
	if !IsDriveEnabled() {
		return fmt.Errorf("google drive belum dikonfigurasi")
	}
	if folderID == "" {
		return fmt.Errorf("folder ID kosong")
	}

	client := driveClient(ctx)
	url := fmt.Sprintf("%s/files/%s?supportsAllDrives=true", driveAPIBase, folderID)
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, url, nil)
	if err != nil {
		return err
	}

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	// 404: folder sudah tidak ada → anggap sukses agar idempoten.
	if resp.StatusCode == http.StatusNotFound {
		return nil
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		data, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		return fmt.Errorf("drive API %s: %s", resp.Status, strings.TrimSpace(string(data)))
	}
	return nil
}

// DriveContext mengembalikan context dengan timeout wajar untuk operasi upload
// (beberapa file beberapa MB).
func DriveContext() (context.Context, context.CancelFunc) {
	return context.WithTimeout(context.Background(), 3*time.Minute)
}
