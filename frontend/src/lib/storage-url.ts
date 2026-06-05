const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

/**
 * Ubah path aset storage backend menjadi URL absolut ke backend.
 *
 * Backend bisa mengembalikan beragam bentuk:
 *   - "http(s)://..."            → dipakai apa adanya
 *   - "/storage/frames/x.svg"    → API_URL + path
 *   - "storage/frames/x.svg"     → API_URL + "/" + path
 *   - "/foo"                     → API_URL + path
 *   - "frames/x.svg" (relatif)   → API_URL + "/storage/" + path
 */
export const toStorageUrl = (path: string | undefined | null): string => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  if (path.startsWith('/storage/')) return `${API_URL}${path}`;
  if (path.startsWith('storage/')) return `${API_URL}/${path}`;
  if (path.startsWith('/')) return `${API_URL}${path}`;
  return `${API_URL}/storage/${path}`;
};
