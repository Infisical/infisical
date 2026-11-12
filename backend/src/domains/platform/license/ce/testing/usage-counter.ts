import { Meter } from "../models/meter";
import { TUsageCounter } from "../services/dependencies";

export const usageCounter = (counters: TUsageCounter[], meter: Meter): TUsageCounter => {
  const counter = counters.find((c) => c.meter === meter);
  if (!counter) throw new Error(`No usage counter was built for '${meter.key}'`);
  return counter;
};
