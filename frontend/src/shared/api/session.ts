import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { MutationConfig, QueryConfig } from '@/lib/react-query';

// --- Types ---

export interface CreateSessionInput {
  packageId: number;
  printCount: number;
}

export interface SessionResponse {
  sessionId: string;
  packageId: number;
  printCount: number;
  basePrice: number;
  finalPrice: number;
  status: 'pending' | 'active' | 'completed' | 'expired';
}

export interface SessionDetailResponse {
  id: string;
  packageId: number;
  packageTitle: string;
  printCount: number;
  basePrice: number;
  extraPrintCost: number;
  voucherCode: string;
  discount: number;
  finalPrice: number;
  status: string;
  createdAt: string;
  expiresAt: string;
}

export interface PatchSessionInput {
  sessionId: string;
  voucherCode: string;
}

// --- API functions ---

export const createSession = async (
  input: CreateSessionInput,
): Promise<SessionResponse> => {
  const response = await apiClient.post<SessionResponse>(
    '/api/sessions',
    input,
  );
  return response.data;
};

export const getSession = async (
  sessionId: string,
): Promise<SessionDetailResponse> => {
  const response = await apiClient.get<SessionDetailResponse>(
    `/api/sessions/${sessionId}`,
  );
  return response.data;
};

export const patchSession = async ({
  sessionId,
  voucherCode,
}: PatchSessionInput): Promise<SessionDetailResponse> => {
  const response = await apiClient.patch<SessionDetailResponse>(
    `/api/sessions/${sessionId}`,
    { voucherCode },
  );
  return response.data;
};

// --- React Query hooks ---

type UseCreateSessionOptions = {
  mutationConfig?: MutationConfig<typeof createSession>;
};

export const useCreateSession = ({
  mutationConfig,
}: UseCreateSessionOptions = {}) => {
  return useMutation({
    ...mutationConfig,
    mutationFn: createSession,
  });
};

export const getSessionQueryOptions = (sessionId: string) => ({
  queryKey: ['session', sessionId],
  queryFn: () => getSession(sessionId),
});

type UseGetSessionOptions = {
  sessionId: string;
  queryConfig?: QueryConfig<typeof getSessionQueryOptions>;
};

export const useGetSession = ({
  sessionId,
  queryConfig,
}: UseGetSessionOptions) => {
  return useQuery({
    ...getSessionQueryOptions(sessionId),
    ...queryConfig,
  });
};

type UsePatchSessionOptions = {
  mutationConfig?: MutationConfig<typeof patchSession>;
};

export const usePatchSession = ({
  mutationConfig,
}: UsePatchSessionOptions = {}) => {
  return useMutation({
    ...mutationConfig,
    mutationFn: patchSession,
  });
};
