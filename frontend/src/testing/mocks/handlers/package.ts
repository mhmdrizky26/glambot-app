import { http, HttpResponse } from 'msw';
import { db } from '../db';
import { networkDelay } from '../utils';

// Seed packages on module load
db.package.create({
  id: 1,
  type: 'digital',
  title: 'Digital Package',
  description:
    'HD photos & slow-motion video delivered to your phone via WhatsApp',
  price: 45000,
  pricePerPrint: 0,
  imageSrc: '/Container.svg',
  isPopular: false,
  durationSecs: 300,
  durationMins: 5,
});

db.package.create({
  id: 2,
  type: 'print',
  title: 'Print Package',
  description: 'Printed photos with premium frame & digital copies included',
  price: 65000,
  pricePerPrint: 15000,
  imageSrc: '/Container (1).svg',
  isPopular: true,
  durationSecs: 300,
  durationMins: 5,
});

export const packageHandlers = [
  http.get('/api/package', async () => {
    await networkDelay();
    const packages = db.package.findMany({});
    return HttpResponse.json(packages, { status: 200 });
  }),
];
