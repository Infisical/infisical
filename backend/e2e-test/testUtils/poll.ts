const DEFAULT_TIMEOUT_MS = 20_000;
const POLL_MS = 100;

export const pollUntil = async <T>(dto: {
  describe: string;
  read: () => Promise<T> | T;
  done: (value: T) => boolean;
  timeoutMs?: number;
}) => {
  const timeoutMs = dto.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const value = await dto.read();
    if (dto.done(value)) return value;

    if (Date.now() >= deadline) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for ${dto.describe}`);
    }

    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      setTimeout(resolve, POLL_MS);
    });
  }
};
