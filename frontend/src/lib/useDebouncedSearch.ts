import { useEffect, useState } from 'react';

/**
 * useDebouncedSearch — mengelola input pencarian dengan debounce.
 *
 * Menyimpan nilai ketik lokal (`localSearch`), menyinkronkan kalau nilai
 * eksternal `search` berubah dari luar (mis. reset filter), dan memanggil
 * `onSearchChange` setelah `delayMs` diam. `isSearchPending` true selagi nilai
 * lokal belum ter-commit ke `search`.
 *
 * Menggantikan blok debounce yang sebelumnya dicopy-paste identik di semua
 * komponen filter admin (Frame/Transaction/Package/Voucher).
 */
export function useDebouncedSearch(
  search: string,
  onSearchChange: (value: string) => void,
  delayMs = 300,
) {
  const [localSearch, setLocalSearch] = useState(search);
  const [lastExternalSearch, setLastExternalSearch] = useState(search);
  const isSearchPending = localSearch !== search;

  // Sinkronkan saat `search` diubah dari luar (adjust state saat render —
  // pola yang direkomendasikan React, bukan efek).
  if (search !== lastExternalSearch) {
    setLastExternalSearch(search);
    setLocalSearch(search);
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearchChange(localSearch);
    }, delayMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localSearch]);

  return { localSearch, setLocalSearch, isSearchPending };
}
