import type { Metadata } from 'next';
import { Space_Grotesk, Changa_One } from 'next/font/google';
import '@/styles/globals.css';
import { Providers } from './providers';
import { MSWInit } from './MSWInit';

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
});

const changaOne = Changa_One({
  weight: '400',
  variable: '--font-changa-one',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'Glambot',
    template: '%s | Glambot',
  },
  description: 'Control the camera with your gestures',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${changaOne.variable} h-full antialiased`}
    >
      <body className="font-grotesk h-full bg-[url('/bg.webp')] bg-cover bg-center bg-fixed">
        <Providers>
          <MSWInit>
            <div className="max-w-360 mx-auto h-full overflow-y-auto relative">
              {children}
            </div>
          </MSWInit>
        </Providers>
      </body>
    </html>
  );
}
