'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PackageCard from '../components/PackageCard';
import PrintQuantityModal from '../components/PrintQuantityModal';
import { usePackages } from '../api/getPackages';
import type { Package } from '../api/getPackages';
import { StatusAnimation } from '@/components/shared/StatusAnimation';
import { useCreateSession } from '@/shared/api/session';
import Timer from '@/components/shared/Timer';
import BackButton from '@/components/shared/BackButton';

export default function PackagePage() {
  const { data: packages = [], isPending, isError } = usePackages();
  const [selectedPrintPkg, setSelectedPrintPkg] = useState<Package | null>(
    null,
  );
  const [createError, setCreateError] = useState<{ message?: string } | null>(
    null,
  );
  const router = useRouter();

  const { mutate: createSession, isPending: isCreating } = useCreateSession({
    mutationConfig: {
      onSuccess: (data) => {
        router.push(`/payment/summary?sessionId=${data.sessionId}`);
      },
      onError: (error: unknown) => {
        setCreateError(error as { message?: string });
      },
    },
  });

  const handleCardClick = (pkg: Package) => {
    if (pkg.type === 'print') {
      setSelectedPrintPkg(pkg);
    } else {
      createSession({ packageId: pkg.id, printCount: 0 });
    }
  };

  const handleModalConfirm = (quantity: number) => {
    if (selectedPrintPkg) {
      createSession({ packageId: selectedPrintPkg.id, printCount: quantity });
    }
    setSelectedPrintPkg(null);
  };

  return (
    <main className="flex flex-col items-center min-h-full">
      <Timer />
      <BackButton onClick={() => router.push('/')} />

      <div className="py-3.5 text-center">
        <h1 className="font-bold text-primary text-[62px]">
          Choose Your Package
        </h1>
        <p className="text-primary text-[24px] leading-6.25 mt-6">
          Select the experience that suits you
        </p>
      </div>

      <div className="flex justify-center items-center mt-18.75 gap-12.25">
        {isPending && (
          <StatusAnimation status="waiting" className="w-55 h-55" />
        )}

        {isError && (
          <p className="text-red-500 text-xl">Failed to load packages</p>
        )}

        {!isPending &&
          !isError &&
          packages.map((pkg) => (
            <PackageCard
              key={pkg.id}
              title={pkg.title}
              description={pkg.description}
              price={pkg.price}
              imageSrc={pkg.imageSrc}
              isPopular={pkg.isPopular}
              onClick={() => handleCardClick(pkg)}
            />
          ))}
      </div>

      <PrintQuantityModal
        isOpen={selectedPrintPkg !== null}
        basePrice={selectedPrintPkg?.price ?? 0}
        pricePerPrint={selectedPrintPkg?.pricePerPrint ?? 15000}
        onClose={() => setSelectedPrintPkg(null)}
        onConfirm={handleModalConfirm}
        isConfirming={isCreating}
      />

      {createError && (
        <p className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-red-500/90 text-white px-6 py-3 rounded-lg text-sm">
          {createError.message ?? 'Failed to create session. Please try again.'}
        </p>
      )}
    </main>
  );
}
