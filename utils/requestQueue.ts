/** Share a concurrency budget across callers; release slots even when a request fails. */
export function createRequestQueue(limit: number) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error('Request concurrency must be a positive integer');
  let active = 0;
  const waiting: (() => void)[] = [];
  return function run<T>(request: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const start = () => {
        active++;
        Promise.resolve().then(request).then(resolve, reject).finally(() => {
          active--;
          waiting.shift()?.();
        });
      };
      if (active < limit) start(); else waiting.push(start);
    });
  };
}
