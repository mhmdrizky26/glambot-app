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
  status: 'pending_payment' | 'paid' | 'shooting' | 'completed' | 'expired';
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
  status: 'pending_payment' | 'paid' | 'shooting' | 'completed' | 'expired';
}

// --- API functions ---

export const createSession = async (
  input: CreateSessionInput,
): Promise<SessionResponse> => {
  const response = await apiClient.post<SessionResponse>('/api/session', input);
  return response.data;
};

export const getSession = async (
  sessionId: string,
): Promise<SessionDetailResponse> => {
  const response = await apiClient.get<SessionDetailResponse>(
    `/api/session/${sessionId}`,
  );
  return response.data;
};

export const patchSessionStatus = async ({
  sessionId,
  status,
}: PatchSessionInput): Promise<SessionDetailResponse> => {
  const response = await apiClient.patch<SessionDetailResponse>(
    `/api/session/${sessionId}/status`,
    { status },
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

type UsePatchSessionStatusOptions = {
  mutationConfig?: MutationConfig<typeof patchSessionStatus>;
};

export const usePatchSessionStatus = ({
  mutationConfig,
}: UsePatchSessionStatusOptions = {}) => {
  return useMutation({
    ...mutationConfig,
    mutationFn: patchSessionStatus,
  });
};
