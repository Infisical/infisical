export const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export const applyJitter = (delayMs: number) => {
  const jitterFactor = 0.2;

  // generates random value in [-0.2, +0.2] range
  const randomFactor = (Math.random() * 2 - 1) * jitterFactor;
  const jitterAmount = randomFactor * delayMs;

  return delayMs + jitterAmount;
};
