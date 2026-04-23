export interface VoucherResult {
  valid: boolean;
  discount: number;
  message: string;
}

export interface PaymentCreateResult {
  transactionId: string;
  qrisUrl: string;
}

export type PaymentStatusResult = 'pending' | 'success' | 'failed';

// Track when each transaction was created for mock timing
const transactionTimestamps = new Map<string, number>();

export async function validateVoucher(code: string): Promise<VoucherResult> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const upperCode = code.toUpperCase();
      if (upperCode === 'GLAMBOT10') {
        resolve({ valid: true, discount: 10000, message: 'Discount applied!' });
      } else if (upperCode === 'FREESHIP') {
        resolve({ valid: true, discount: 5000, message: 'Discount applied!' });
      } else {
        resolve({ valid: false, discount: 0, message: 'Voucher is not valid' });
      }
    }, 800);
  });
}

export async function createPayment(
  _total: number,
): Promise<PaymentCreateResult> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      transactionTimestamps.set(transactionId, Date.now());

      resolve({
        transactionId,
        qrisUrl: '/PaymentFlow.svg',
      });
    }, 200);
  });
}

export async function checkPaymentStatus(
  transactionId: string,
): Promise<PaymentStatusResult> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const createdAt = transactionTimestamps.get(transactionId);
      if (!createdAt) {
        resolve('failed');
        return;
      }

      const elapsed = Date.now() - createdAt;
      // Auto-success after 15 seconds for mock simulation
      if (elapsed > 15000) {
        transactionTimestamps.delete(transactionId);
        resolve('success');
      } else {
        resolve('pending');
      }
    }, 300);
  });
}
