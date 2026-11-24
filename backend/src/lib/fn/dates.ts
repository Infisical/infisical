export const getLastMidnightDateISO = (last = 1) =>
  `${new Date(new Date().setDate(new Date().getDate() - last)).toISOString().slice(0, 10)}T00:00:00Z`;

export const getTimeDifferenceInSeconds = (lhsTimestamp: string, rhsTimestamp: string) => {
  const lhs = new Date(lhsTimestamp);
  const rhs = new Date(rhsTimestamp);
  return Math.floor((Number(lhs) - Number(rhs)) / 1000);
};

// A date read back from a cache comes as a string; null and undefined stay as they are.
export const asDate = <T extends Date | string | null | undefined>(value: T) =>
  (value ? new Date(value) : value) as T extends string ? Date : T;
