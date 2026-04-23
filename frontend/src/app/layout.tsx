import type { Metadata } from 'next';
import { Space_Grotesk, Changa_One } from 'next/font/google';
import '@/styles/globals.css';

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
      <body className="font-grotesk min-h-screen  bg-[url('/bg.webp')] bg-cover bg-center">
        {children}
      </body>
    </html>
  );
}
