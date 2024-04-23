export const getLastMidnightDateISO = (last = 1) =>
  `${new Date(new Date().setDate(new Date().getDate() - last)).toISOString().slice(0, 10)}T00:00:00Z`;
