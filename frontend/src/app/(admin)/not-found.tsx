'use client';

import { useRouter } from 'next/navigation';
import { NotFoundState } from '@/components/admin/shared/NotFoundState';

export default function AdminNotFound() {
  const router = useRouter();

  return (
    <NotFoundState
      title="Halaman tidak ditemukan"
      description="URL yang Anda buka tidak tersedia, atau halaman ini sudah dipindahkan."
      backLabel="Kembali ke Dashboard"
      onBack={() => router.push('/dashboard')}
    />
  );
}
