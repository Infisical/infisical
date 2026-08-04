export const waitForMinimumDuration = async (startedAt: number, durationMs: number) => {
  const remainingDuration = Math.max(0, durationMs - (Date.now() - startedAt));

  if (remainingDuration > 0) {
    await new Promise((resolve) => {
      setTimeout(resolve, remainingDuration);
    });
  }
};
