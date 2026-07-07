import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { axiosInstance } from '@/lib/api-admin';

// Tuning robot yang diatur admin — diteruskan backend ke service dobot agar
// berlaku live. Cocok dengan robotSettings di backend (handlers/robot_settings.go)
// dan RUNTIME_TUNABLES di dobot (app/core/runtime.py). Speed 1–100; timing detik.
export interface RobotSettings {
  robotSpeedFactor: number;
  robotJointSpeed: number;
  robotJointAcc: number;
  safetyHoldSec: number;
  safetyTimeout: number;
  presetDebounceFrames: number;
  postActionDelay: number;
}

export const ROBOT_SETTINGS_KEY = ['admin', 'robot-settings'] as const;

const getRobotSettings = async (): Promise<RobotSettings> => {
  const res = await axiosInstance.get('/api/admin/robot-settings');
  return res.data as unknown as RobotSettings;
};

export const useRobotSettings = () =>
  useQuery({
    queryKey: ROBOT_SETTINGS_KEY,
    queryFn: getRobotSettings,
    staleTime: 0,
  });

const updateRobotSettings = async (
  data: Partial<RobotSettings>,
): Promise<RobotSettings> => {
  const res = await axiosInstance.patch('/api/admin/robot-settings', data);
  return res.data as unknown as RobotSettings;
};

export const useUpdateRobotSettings = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateRobotSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(ROBOT_SETTINGS_KEY, data);
    },
  });
};
