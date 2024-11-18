export const daysToMillisecond = (days: number) => days * 24 * 60 * 60 * 1000;

export const secondsToMillis = (seconds: number) => seconds * 1000;

export const applyJitter = (delayMs: number, jitterMs: number) => {
  const jitter = Math.floor(Math.random() * (2 * jitterMs)) - jitterMs;
  return delayMs + jitter;
};
