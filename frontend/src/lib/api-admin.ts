import axios, { AxiosError } from 'axios';

export const axiosInstance = axios.create({
  baseURL: `${process.env.NEXT_PUBLIC_API_URL}`,
  withCredentials: false,
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const message =
      (error.response?.data as { message?: string })?.message ??
      error.message ??
      'Terjadi kesalahan. Silakan coba lagi.';
    const apiError = new Error(message);
    Object.assign(apiError, {
      response: error.response,
      statusCode: error.response?.status ?? 0,
      errors: (error.response?.data as { errors?: Record<string, string[]> })
        ?.errors,
    });
    return Promise.reject(apiError);
  },
);
