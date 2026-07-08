export function formatPriceToK(price: number): string {
  if (price >= 1000) {
    const result = price / 1000;
    return `${result}K`;
  }
  return price.toString();
}

export function formatRupiah(value: number): string {
  return new Intl.NumberFormat('id-ID').format(value);
}

// Format mata uang IDR lengkap dengan prefix "Rp" (mis. "Rp 45.000"), tanpa
// desimal. Sumber tunggal untuk komponen admin yang sebelumnya masing-masing
// mendeklarasikan formatCurrency identik.
export function formatIDR(value: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(value);
}
