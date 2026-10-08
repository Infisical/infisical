// pg returns bigint (int8) columns as strings, so both values must be converted
// to numbers before comparing. Comparing strings is alphabetical: "2" >= "1000000" is true.
export const isClientSecretUsageLimitReached = (
  numUses: number | string,
  numUsesLimit: number | string
): boolean => {
  const limit = Number(numUsesLimit);
  return limit > 0 && Number(numUses) >= limit;
};