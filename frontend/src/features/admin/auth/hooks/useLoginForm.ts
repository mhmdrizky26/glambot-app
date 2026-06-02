import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, LoginFormData } from '../forms/login';
import { useRouter } from 'next/navigation';

export const useLoginForm = () => {
  const router = useRouter();

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const handleLogin = async (_data: LoginFormData) => {
    try {
      router.push('/dashboard');
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  const onSubmit = form.handleSubmit(handleLogin);

  return {
    form,
    onSubmit,
    isLoading: form.formState.isSubmitting,
  };
};
