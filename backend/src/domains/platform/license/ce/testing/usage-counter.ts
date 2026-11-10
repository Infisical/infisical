import { TUsageCounter } from "../service/dependencies";

export const usageCounter = (counters: TUsageCounter[], key: string): TUsageCounter => {
  const counter = counters.find((c) => c.meter.key === key);
  if (!counter) throw new Error(`No usage counter was built for '${key}'`);
  return counter;
};
