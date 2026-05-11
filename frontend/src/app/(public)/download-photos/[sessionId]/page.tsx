import { Metadata } from 'next';
import { PhotoDownloadPage } from '@/features/public/photo-download/pages/PhotoDownloadPage';

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

export const metadata: Metadata = {
  title: 'Download Foto',
  description: 'Lihat dan unduh foto hasil sesi foto Anda.',
};

export default async function Page({ params }: PageProps) {
  const { sessionId } = await params;

  return <PhotoDownloadPage sessionId={sessionId} />;
}
