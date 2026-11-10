import { TUsageCounter } from "../service/dependencies";

// The counter a domain built for a meter, so its test can call it directly.
export const usageCounter = (counters: TUsageCounter[], key: string): TUsageCounter => {
  const counter = counters.find((c) => c.meter.key === key);
  if (!counter) throw new Error(`No usage counter was built for '${key}'`);
  return counter;
};
