export interface Package {
  id: number;
  type: 'digital' | 'print';
  title: string;
  description: string;
  price: number;
  pricePerPrint?: number;
  imageSrc: string;
  badge?: string;
}

const mockPackages: Package[] = [
  {
    id: 1,
    type: 'digital',
    title: 'Digital Package',
    description:
      'HD photos & slow-motion video delivered to your phone via WhatsApp',
    price: 45000,
    imageSrc: '/Container.svg',
  },
  {
    id: 2,
    type: 'print',
    title: 'Print Package',
    description: 'Printed photos with premium frame & digital copies included',
    price: 65000,
    pricePerPrint: 15000,
    imageSrc: '/Container (1).svg',
    badge: 'Popular',
  },
];

export async function fetchPackages(): Promise<Package[]> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(mockPackages);
    }, 1000);
  });
}
