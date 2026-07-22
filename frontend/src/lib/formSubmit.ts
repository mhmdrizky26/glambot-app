/**
 * Bungkus handler submit form dengan try/catch + logging seragam.
 * Dipakai oleh form admin (voucher/frame/package) supaya wrapper
 * error-handling-nya tidak ditulis ulang di tiap hook.
 */
export function withFormErrorLogging<T>(onSubmit: (data: T) => Promise<void>) {
  return async (data: T) => {
    try {
      await onSubmit(data);
    } catch (error) {
      console.error('Form submission error:', error);
    }
  };
}
