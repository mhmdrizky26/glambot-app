import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { frameSchema, FrameFormData } from '../forms/frame';
import { Frame } from '../api/types';

interface UseFrameFormProps {
  defaultValues?: Partial<Frame>;
  onSubmit: (data: FrameFormData) => Promise<void>;
}

export const useFrameForm = ({
  defaultValues,
  onSubmit,
}: UseFrameFormProps) => {
  const form = useForm<FrameFormData>({
    resolver: zodResolver(frameSchema),
    defaultValues: {
      canvasWidth: defaultValues?.canvasWidth ?? 464,
      canvasHeight: defaultValues?.canvasHeight ?? 696,
      slots: defaultValues?.slots
        ? defaultValues.slots.map(({ id: _id, ...rest }) => rest)
        : [],
      name: defaultValues?.name ?? '',
      category: defaultValues?.category ?? '',
      description: defaultValues?.description ?? '',
      status: defaultValues?.status ?? 'active',
    },
  });

  const handleSubmit = async (data: FrameFormData) => {
    try {
      await onSubmit(data);
    } catch (error) {
      console.error('Form submission error:', error);
    }
  };

  const handleFormSubmit = form.handleSubmit(handleSubmit);

  return {
    form,
    onSubmit: handleFormSubmit,
    isLoading: form.formState.isSubmitting,
  };
};
