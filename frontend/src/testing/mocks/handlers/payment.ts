import { http, HttpResponse } from 'msw';
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
  http.post('/api/payment', async ({ request }) => {
    await networkDelay();

    const body = (await request.json()) as { sessionId: string };

    const session = db.session.findFirst({
      where: { id: { equals: body.sessionId } },
    });

    if (!session) {
      return HttpResponse.json(
        { message: 'Session not found' },
        { status: 404 },
      );
    }

    const now = new Date();

    const transaction = db.transaction.create({
      sessionId: session.id,
      midtransOrderId: `ORDER-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      amount: session.finalPrice,
      status: 'pending',
      qrisUrl: '/PaymentFlow.svg',
      qrisRawString: '',
      paidAt: '',
      createdAt: now.toISOString(),
    });

    return HttpResponse.json(
      {
        session: {
          id: session.id,
          packageId: session.packageId,
          printCount: session.printCount,
          basePrice: session.basePrice,
          voucherCode: session.voucherCode,
          discount: session.discount,
          finalPrice: session.finalPrice,
          status: session.status,
          frameId: session.frameId,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          completedAt: session.completedAt,
        },
        transaction,
      },
      { status: 201 },
    );
  }),

  http.get('/api/payment/:midtransOrderID/status', async ({ params }) => {
    await networkDelay();

    const { midtransOrderID } = params as { midtransOrderID: string };
    const transaction = db.transaction.findFirst({
      where: { midtransOrderId: { equals: midtransOrderID } },
    });

    if (!transaction) {
      return HttpResponse.json(
        { message: 'Transaction not found' },
        { status: 404 },
      );
    }

    return HttpResponse.json({ status: transaction.status }, { status: 200 });
  }),

  http.post('/api/voucher/apply', async ({ request }) => {
    await networkDelay();

    const body = (await request.json()) as {
      sessionId: string;
      voucherCode: string;
    };

    const session = db.session.findFirst({
      where: { id: { equals: body.sessionId } },
    });

    if (!session) {
      return HttpResponse.json(
        { message: 'Session not found' },
        { status: 404 },
      );
    }

    const voucher = db.voucher.findFirst({
      where: { code: { equals: body.voucherCode } },
    });

    if (!voucher || !voucher.isActive) {
      return HttpResponse.json(
        {
          valid: false,
          message: 'Invalid or inactive voucher code',
          discountAmount: 0,
          finalPrice: session.finalPrice,
          voucher: null,
        },
        { status: 200 },
      );
    }

    const pkg = db.package.findFirst({
      where: { id: { equals: session.packageId } },
    });
    const extraPrintCost = session.printCount * pkg!.pricePerPrint;
    const totalBeforeDiscount = session.basePrice + extraPrintCost;

    // Check minimum price requirement
    if (totalBeforeDiscount < voucher.minPrice) {
      return HttpResponse.json(
        {
          valid: false,
          message: `Minimum purchase of Rp${voucher.minPrice.toLocaleString('id-ID')} required for this voucher`,
          discountAmount: 0,
          finalPrice: session.finalPrice,
          voucher: null,
        },
        { status: 200 },
      );
    }

    // Calculate discount
    let discountAmount = 0;
    if (voucher.discountType === 'percentage') {
      discountAmount = Math.floor(
        (totalBeforeDiscount * voucher.discountValue) / 100,
      );
    } else {
      discountAmount = voucher.discountValue;
    }

    const finalPrice = Math.max(0, totalBeforeDiscount - discountAmount);

    // Update session with voucher
    db.session.update({
      where: { id: { equals: body.sessionId } },
      data: {
        voucherCode: body.voucherCode,
        discount: discountAmount,
        finalPrice,
      },
    });

    const formatDiscount = (v: typeof voucher) => {
      if (v.discountType === 'percentage') {
        return `${v.discountValue}%`;
      }
      return `Rp${v.discountValue.toLocaleString('id-ID')}`;
    };

    return HttpResponse.json(
      {
        valid: true,
        message: `Voucher applied! Save ${formatDiscount(voucher)}`,
        discountAmount,
        finalPrice,
        voucher: {
          code: voucher.code,
          description: voucher.description,
          discountType: voucher.discountType,
          discountValue: voucher.discountValue,
        },
      },
      { status: 200 },
    );
  }),
];
