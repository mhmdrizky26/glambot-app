import { DiscountType } from '../api/types';

export const formatDiscount = (value: number, type: DiscountType): string => {
  if (type === 'percentage') {
    return `${value}%`;
  }

  // Format as currency (Rp)
  return `Rp ${value.toLocaleString('id-ID')}`;
};

export const formatCurrency = (value: number): string => {
  return `Rp ${value.toLocaleString('id-ID')}`;
};
