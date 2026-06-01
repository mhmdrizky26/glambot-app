import { Voucher } from '../api/types';

export const isVoucherExpired = (voucher: Voucher, now?: number): boolean => {
  if (!voucher.expiresAt) return false;
  if (now === undefined) return false;
  return now > new Date(voucher.expiresAt).getTime();
};

export type DerivedVoucherStatus = 'active' | 'inactive' | 'expired';

export const getDerivedStatus = (
  voucher: Voucher,
  now?: number,
): DerivedVoucherStatus => {
  if (!voucher.isActive) return 'inactive';
  if (isVoucherExpired(voucher, now)) return 'expired';
  return 'active';
};

export const isVoucherUsable = (voucher: Voucher, now?: number): boolean => {
  if (!voucher.isActive) return false;
  if (isVoucherExpired(voucher, now)) return false;
  if (voucher.usedCount >= voucher.maxUses) return false;
  return true;
};

export const getStatusColor = (status: DerivedVoucherStatus): string => {
  switch (status) {
    case 'active':
      return 'bg-green-100 text-green-800';
    case 'inactive':
      return 'bg-gray-100 text-gray-800';
    case 'expired':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
};
