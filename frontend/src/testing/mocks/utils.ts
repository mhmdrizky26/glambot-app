/**
 * Simulates network latency.
 * @param ms - Delay in milliseconds. If omitted, a random 300–800ms delay is used.
 */
export function networkDelay(ms?: number): Promise<void> {
  const delay = ms ?? Math.floor(Math.random() * 500) + 300;
  return new Promise((resolve) => setTimeout(resolve, delay));
}
