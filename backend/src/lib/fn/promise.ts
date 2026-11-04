// Promise.all rejects with whichever call fails first in time. Unwrapping allSettled results in the order the
// old sequential code checked them keeps the error a caller sees the same as before the calls ran concurrently.
export const unwrapSettled = <T>(result: PromiseSettledResult<T>): T => {
  if (result.status === "rejected") throw result.reason;
  return result.value;
};
