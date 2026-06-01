import { DiscountType } from '../api/types';

export const formatDiscount = (value: number, type: DiscountType): string => {
  if (type === 'percentage') {
    return `${value}%`;
  }

  // Format as currency (Rp)
  return `Rp ${value.toLocaleString('id-ID')}`;
};

export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('id-ID', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export const formatDateRange = (startDate: string, endDate: string): string => {
  return `${formatDate(startDate)} - ${formatDate(endDate)}`;
};

export const formatCurrency = (value: number): string => {
  return `Rp ${value.toLocaleString('id-ID')}`;
};
