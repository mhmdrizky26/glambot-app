import { http, HttpResponse } from 'msw';
import { nanoid } from 'nanoid';
import { db } from '../db';
import { networkDelay } from '../utils';

// Seed vouchers on module load
db.voucher.create({
  code: 'GLAMBOT10',
  description: '10% discount on your order',
  discountType: 'percentage',
  discountValue: 10,
  minPrice: 50000,
  maxUses: 100,
  usedCount: 0,
  isActive: true,
  expiresAt: '',
  createdAt: new Date().toISOString(),
});

db.voucher.create({
  code: 'FREESHIP',
  description: 'Flat Rp15.000 discount',
  discountType: 'fixed',
  discountValue: 15000,
  minPrice: 0,
  maxUses: 50,
  usedCount: 0,
  isActive: true,
  expiresAt: '',
  createdAt: new Date().toISOString(),
});

export const paymentHandlers = [
  http.post('/api/payments', async ({ request }) => {
    await networkDelay();

    const body = (await request.json()) as {
      total: number;
      packageId: number;
      voucherCode?: string;
    };

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes

    const session = db.session.create({
      packageId: body.packageId,
      voucherCode: body.voucherCode ?? '',
      discount: 0,
      finalPrice: body.total,
      status: 'pending',
      frameId: '',
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      completedAt: '',
    });

    const transaction = db.transaction.create({
      sessionId: session.id,
      midtransOrderId: `ORDER-${nanoid(8).toUpperCase()}`,
      amount: body.total,
      status: 'pending',
      qrisUrl: '/PaymentFlow.svg',
      qrisRawString: '',
      paidAt: '',
      createdAt: now.toISOString(),
    });

    return HttpResponse.json({ transaction, session }, { status: 201 });
  }),

  http.get('/api/payments/:transactionId/status', async ({ params }) => {
    await networkDelay();

    const { transactionId } = params as { transactionId: string };
    const transaction = db.transaction.findFirst({
      where: { id: { equals: transactionId } },
    });

    if (!transaction) {
      return HttpResponse.json({ message: 'Transaction not found' }, { status: 404 });
    }

    return HttpResponse.json({ status: transaction.status }, { status: 200 });
  }),

  http.post('/api/vouchers/validate', async ({ request }) => {
    await networkDelay();

    const body = (await request.json()) as { code: string };
    const voucher = db.voucher.findFirst({
      where: { code: { equals: body.code } },
    });

    if (!voucher || !voucher.isActive) {
      return HttpResponse.json(
        { valid: false, discount: 0, message: 'Invalid voucher code' },
        { status: 200 },
      );
    }

    return HttpResponse.json(
      { valid: true, discount: voucher.discountValue, message: voucher.description },
      { status: 200 },
    );
  }),
];
