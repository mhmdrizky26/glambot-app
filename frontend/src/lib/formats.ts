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
