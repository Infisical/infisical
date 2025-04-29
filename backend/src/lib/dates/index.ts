export const daysToMillisecond = (days: number) => days * 24 * 60 * 60 * 1000;

export const secondsToMillis = (seconds: number) => seconds * 1000;

export const applyJitter = (delay: number, jitter: number) => {
  const jitterTime = Math.floor(Math.random() * (2 * jitter)) - jitter;
  return delay + jitterTime;
};
