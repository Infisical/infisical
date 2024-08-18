export const getLastMidnightDateISO = (last = 1) =>
  `${new Date(new Date().setDate(new Date().getDate() - last)).toISOString().slice(0, 10)}T00:00:00Z`;

export const getTimeDifferenceInSeconds = (lhsTimestamp: string, rhsTimestamp: string) => {
  const lhs = new Date(lhsTimestamp);
  const rhs = new Date(rhsTimestamp);
  return Math.floor((Number(lhs) - Number(rhs)) / 1000);
};
