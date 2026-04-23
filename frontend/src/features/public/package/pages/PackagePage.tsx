'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PackageCard from '../components/PackageCard';
import PrintQuantityModal from '../components/PrintQuantityModal';
import { usePackages } from '../api/getPackages';
import type { Package } from '../api/getPackages';
import { StatusAnimation } from '@/components/shared/StatusAnimation';

export default function PackagePage() {
  const { data: packages = [], isPending, isError } = usePackages();
  const [selectedPrintPkg, setSelectedPrintPkg] = useState<Package | null>(
    null,
  );
  const router = useRouter();

  const navigateToSummary = (pkg: Package, printCount = 0) => {
    const params = new URLSearchParams({
      packageId: pkg.id.toString(),
      title: pkg.title,
      type: pkg.type,
      basePrice: pkg.price.toString(),
      printCount: printCount.toString(),
      pricePerPrint: (pkg.pricePerPrint ?? 0).toString(),
    });
    router.push(`/payment/summary?${params.toString()}`);
  };

  const handleCardClick = (pkg: Package) => {
    if (pkg.type === 'print') {
      setSelectedPrintPkg(pkg);
    } else {
      navigateToSummary(pkg);
    }
  };

  const handleModalConfirm = (quantity: number) => {
    if (selectedPrintPkg) {
      navigateToSummary(selectedPrintPkg, quantity);
    }
    setSelectedPrintPkg(null);
  };

  return (
    <main className="flex flex-col items-center min-h-screen">
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
      />
    </main>
  );
}
