/**
 * HTML number inputs emit strings. Store finite numbers in React Hook Form so
 * provider-owned `z.number()` schemas receive the value type they declare.
 */
export const parseDynamicSecretProviderNumberInput = (value: string) => {
  if (value.trim() === "") return undefined;

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : undefined;
};
