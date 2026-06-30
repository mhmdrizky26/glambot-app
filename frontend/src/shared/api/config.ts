import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

// Timer halaman user yang diatur admin (GET /api/config). Default = nilai
// hardcode lama, dipakai backend bila key belum diset — di sini hanya untuk
// tipe & dokumentasi.
export interface AppConfig {
  packageTimeoutSecs: number;
  summaryTimeoutSecs: number;
  instructionTimeoutSecs: number;
  photoEditorTimeoutSecs: number;
  getPhotosTimeoutSecs: number;
  doneScreenTimeoutSecs: number;
}

const getAppConfig = async (): Promise<AppConfig> => {
  const res = await apiClient.get<AppConfig>('/api/config');
  return res.data as unknown as AppConfig;
};

/**
 * Ambil timer config dari backend.
 *
 * CATATAN penting: JANGAN render <Timer> sebelum `data` ada. Timer pakai
 * usePersistedCountdown yang me-reset hitungan saat `duration` berubah — kalau
 * kita render dulu pakai durasi default lalu ganti ke nilai asli, timer yang
 * persisted (photo-editor/get-photos/done) bisa ke-reset saat refresh. Maka
 * pemanggil sebaiknya gate: `{config && <Timer duration={config.x} />}`.
 */
export const useAppConfig = () =>
  useQuery({
    queryKey: ['app-config'],
    queryFn: getAppConfig,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
