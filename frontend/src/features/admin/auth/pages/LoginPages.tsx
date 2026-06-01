'use client';

import { LoginForm } from '../components/LoginForm';

export default function LoginPage() {
  return (
    <main className="font-inter relative min-h-screen w-full overflow-hidden bg-[#007DFC]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-50 left-20 h-80 w-80 rounded-full bg-[#ACD5FF] blur-[146.9px] sm:h-96 sm:w-96 lg:h-118 lg:w-118 xl:h-118 xl:w-118" />

        <div className="absolute -top-40 -right-30 h-72 w-72 rounded-full bg-[#ACD5FF] blur-[146.9px] sm:h-80 sm:w-80 lg:h-118 lg:w-118 xl:h-118 xl:w-118" />

        <div className="absolute -bottom-70 -left-50 h-76 w-76 -translate-y-1/2 rounded-full bg-[#ACD5FF] blur-[146.9px] sm:h-88 sm:w-88 lg:h-118 lg:w-118 xl:h-118 xl:w-118" />

        <div className="absolute top-1/3 -right-40 h-84 w-84 rounded-full bg-[#ACD5FF] blur-[146.9px] sm:h-96 sm:w-96 lg:h-118 lg:w-118 xl:h-118 xl:w-118" />

        <div className="absolute right-1/5 -bottom-50 h-68 w-68 rounded-full bg-[#ACD5FF] blur-[146.9px] sm:h-80 sm:w-80 lg:h-118 lg:w-118 xl:h-118 xl:w-118" />
      </div>

      {/* Login Form Container - Positioned to the Right */}
      <div className="relative z-10 flex min-h-screen items-center justify-end px-4 py-8 md:px-8 md:py-12 lg:px-12 xl:px-20">
        <LoginForm />
      </div>
    </main>
  );
}
