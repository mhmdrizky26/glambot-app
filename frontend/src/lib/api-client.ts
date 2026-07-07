import axios, { AxiosError } from 'axios';

export interface ApiError {
  message: string;
  statusCode: number;
  errors?: Record<string, string[]>;
}

/**
 * Resolve API base URL.
 *
 * Strategy:
 * - In the browser: if env points to localhost/127.0.0.1 but the page itself
 *   is opened from a LAN IP (192.168.x.x, etc.), the env localhost is wrong
 *   for that device — derive backend URL from current page hostname instead.
 *   This makes the same build work on PC (localhost) and phones (LAN IP).
 * - If env is a non-local URL (e.g. production domain), respect it.
 * - SSR / no env / no window → fall back to localhost.
 */
export const resolveBaseUrl = (): string => {
  const envUrl = process.env.NEXT_PUBLIC_API_URL?.trim();

  if (typeof window !== 'undefined') {
    const currentHost = window.location.hostname;
    const onLocalhost = currentHost === 'localhost' || currentHost === '127.0.0.1';

    if (envUrl) {
      const envIsLocal = /localhost|127\.0\.0\.1/.test(envUrl);
      // env says localhost but page is on LAN IP → override using window host
      if (envIsLocal && !onLocalhost) {
        return `${window.location.protocol}//${currentHost}:8080`;
      }
      return envUrl;
    }

    // No env → always derive from current page
    return `${window.location.protocol}//${currentHost}:8080`;
  }

  if (envUrl) return envUrl;
  return 'http://localhost:8080';
};

/**
 * Resolve URL dobot robot service (Flask, default :5001).
 *
 * Sama strateginya dengan resolveBaseUrl: hormati NEXT_PUBLIC_ROBOT_URL kalau
 * di-set ke host non-lokal; kalau env-nya localhost tapi halaman dibuka dari
 * LAN IP, derive dari hostname halaman + port 5001. Ini bikin Monitor 2 jalan
 * baik di PC kiosk (localhost) maupun device LAN.
 */
export const resolveRobotUrl = (): string => {
  const envUrl = process.env.NEXT_PUBLIC_ROBOT_URL?.trim();

  if (typeof window !== 'undefined') {
    const currentHost = window.location.hostname;
    const onLocalhost = currentHost === 'localhost' || currentHost === '127.0.0.1';

    if (envUrl) {
      const envIsLocal = /localhost|127\.0\.0\.1/.test(envUrl);
      if (envIsLocal && !onLocalhost) {
        return `${window.location.protocol}//${currentHost}:5001`;
      }
      return envUrl;
    }
    return `${window.location.protocol}//${currentHost}:5001`;
  }

  if (envUrl) return envUrl;
  return 'http://localhost:5001';
};

export const apiClient = axios.create({
  baseURL: resolveBaseUrl(),
  timeout: 15000,
});

apiClient.interceptors.request.use((config) => {
  config.baseURL = resolveBaseUrl();
  return config;
});

/**
 * Convert a possibly-relative URL (e.g. `/storage/...`) into an absolute URL
 * by prepending the resolved API base. Pass-through if already absolute.
 */
export const toAbsoluteUrl = (path: string): string =>
  path.startsWith('http') ? path : `${resolveBaseUrl()}${path}`;

apiClient.interceptors.response.use(
  (response) => {
    const body = (response as any).data;
    if (body && typeof body === 'object' && Object.prototype.hasOwnProperty.call(body, 'data')) {
      (response as any).data = body.data;
    }
    return response;
  },
  (error: AxiosError) => {
    const apiError: ApiError = {
      message:
        (error.response?.data as { message?: string })?.message ??
        error.message ??
        'An unexpected error occurred',
      statusCode: error.response?.status ?? 0,
      errors: (error.response?.data as { errors?: Record<string, string[]> })
        ?.errors,
    };
    return Promise.reject(apiError);
  },
);
