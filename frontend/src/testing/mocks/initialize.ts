export async function initializeMocks(): Promise<void> {
  if (
    typeof window === 'undefined' ||
    process.env.NEXT_PUBLIC_ENABLE_API_MOCKING !== 'true'
  ) {
    return;
  }

  try {
    const { worker } = await import('./browser');
    await worker.start({ onUnhandledRequest: 'bypass' });
    console.log('[MSW] Mocking enabled');
  } catch (error) {
    console.error('[MSW] Failed to start mock worker:', error);
  }
}
