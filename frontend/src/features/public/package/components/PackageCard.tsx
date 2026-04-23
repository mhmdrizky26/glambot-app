'use client';

import Image from 'next/image';
import { formatPriceToK } from '@/lib/formats';

interface PackageCardProps {
  title: string;
  description: string;
  price: number;
  imageSrc: string;
  badge?: string;
  onClick?: () => void;
}

export default function PackageCard({
  title,
  description,
  price,
  imageSrc,
  badge,
  onClick,
}: PackageCardProps) {
  return (
    <div
      onClick={onClick}
      className="overflow-hidden w-116 h-134.25 bg-white-400 bg-clip-padding backdrop-filter backdrop-blur-sm bg-opacity-10 border border-gray-100 hover:border-2 hover:border-primary rounded-[29px] cursor-pointer transition-all duration-300"
    >
      <div className="relative">
        <Image width={464} height={244} priority src={imageSrc} alt={title} />
        {badge && (
          <div className="absolute top-2 left-2 gradient-primary text-white px-3.5 py-1 m-2 rounded-full text-sm font-medium">
            {badge}
          </div>
        )}
      </div>

      <div className="p-9.5">
        <h3 className="text-primary font-bold text-[26px] mb-3">{title}</h3>
        <p className="text-primary text-[18px] leading-6.75">{description}</p>
        <p className="text-primary text-[58px] font-bold mt-6">
          RP {formatPriceToK(price)}
        </p>
      </div>
    </div>
  );
}
