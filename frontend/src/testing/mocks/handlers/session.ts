import { http, HttpResponse } from 'msw';
import { db } from '../db';
import { networkDelay } from '../utils';

export const sessionHandlers = [
  http.post('/api/session', async ({ request }) => {
    await networkDelay();

    const { packageId, printCount } = (await request.json()) as {
      packageId: number;
      printCount: number;
    };

    const pkg = db.package.findFirst({ where: { id: { equals: packageId } } });

    if (!pkg) {
      return HttpResponse.json(
        { message: 'Package not found' },
        { status: 404 },
      );
    }

    const basePrice = pkg.price;
    const finalPrice = basePrice + printCount * pkg.pricePerPrint;

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);

    const session = db.session.create({
      packageId,
      printCount,
      basePrice,
      finalPrice,
      status: 'pending_payment',
      voucherCode: '',
      discount: 0,
      frameId: '',
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      completedAt: '',
    });

    return HttpResponse.json(
      {
        sessionId: session.id,
        packageId: session.packageId,
        printCount: session.printCount,
        basePrice: session.basePrice,
        finalPrice: session.finalPrice,
        status: session.status,
      },
      { status: 201 },
    );
  }),

  http.get('/api/session/:sessionId', async ({ params }) => {
    await networkDelay();

    const { sessionId } = params as { sessionId: string };

    const session = db.session.findFirst({
      where: { id: { equals: sessionId } },
    });

    if (!session) {
      return HttpResponse.json(
        { message: 'Session not found' },
        { status: 404 },
      );
    }

    const pkg = db.package.findFirst({
      where: { id: { equals: session.packageId } },
    });

    const extraPrintCost = session.printCount * pkg!.pricePerPrint;

    return HttpResponse.json(
      {
        id: session.id,
        packageId: session.packageId,
        packageTitle: pkg!.title,
        printCount: session.printCount,
        basePrice: session.basePrice,
        extraPrintCost,
        voucherCode: session.voucherCode,
        discount: session.discount,
        finalPrice: session.finalPrice,
        status: session.status,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      },
      { status: 200 },
    );
  }),

  http.patch('/api/session/:sessionId/status', async ({ params, request }) => {
    await networkDelay();

    const { sessionId } = params as { sessionId: string };
    const { status } = (await request.json()) as { status: string };

    const session = db.session.findFirst({
      where: { id: { equals: sessionId } },
    });

    if (!session) {
      return HttpResponse.json(
        { message: 'Session not found' },
        { status: 404 },
      );
    }

    const pkg = db.package.findFirst({
      where: { id: { equals: session.packageId } },
    });
    const extraPrintCost = session.printCount * pkg!.pricePerPrint;

    // Update only session status
    const updatedSession = db.session.update({
      where: { id: { equals: sessionId } },
      data: { status },
    })!;

    return HttpResponse.json(
      {
        id: updatedSession.id,
        packageId: updatedSession.packageId,
        packageTitle: pkg!.title,
        printCount: updatedSession.printCount,
        basePrice: updatedSession.basePrice,
        extraPrintCost,
        voucherCode: updatedSession.voucherCode,
        discount: updatedSession.discount,
        finalPrice: updatedSession.finalPrice,
        status: updatedSession.status,
        createdAt: updatedSession.createdAt,
        expiresAt: updatedSession.expiresAt,
      },
      { status: 200 },
    );
  }),
];
