import v8 from "node:v8";

import { FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

import { TConcurrencySlot } from "@app/lib/concurrency/concurrency-limiter";
import { getConfig, TEnvConfig } from "@app/lib/config/env";
import { ServerBusyError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import {
  recordSecretRateLimitExceededMetric,
  recordSecretReadSizeMetric,
  registerSecretReadBudgetGauges,
  SecretRateLimitBucket,
  SecretRateLimitOutcome,
  SecretReadEstimateSource
} from "@app/lib/telemetry/metrics";

const REFUSAL_LOG_INTERVAL_MS = 10_000;
const MAX_REMEMBERED_SIZES = 10_000;
const REFUSAL_MESSAGE = "Infisical is handling too many secret list requests right now. Please try again in a second";

const unlimitedSlot: TConcurrencySlot = (work) => work(() => {});

const toWeight = (secretCount: number) => Math.max(1, Math.ceil(secretCount));

const computeSecretReadBudget = (
  appCfg: Pick<
    TEnvConfig,
    "SECRET_READ_HEAP_BASELINE_BYTES" | "SECRET_READ_HEAP_RESERVE_BYTES" | "SECRET_READ_PEAK_BYTES_PER_SECRET"
  >,
  isEnforced: boolean
) => {
  const heapLimit = v8.getHeapStatistics().heap_size_limit;
  const available = heapLimit - appCfg.SECRET_READ_HEAP_BASELINE_BYTES - appCfg.SECRET_READ_HEAP_RESERVE_BYTES;
  const budget = Math.floor(available / appCfg.SECRET_READ_PEAK_BYTES_PER_SECRET);
  if (budget >= 1) return budget;

  const problem = `the heap limit (${heapLimit} bytes) leaves no room for secret list requests after SECRET_READ_HEAP_BASELINE_BYTES (${appCfg.SECRET_READ_HEAP_BASELINE_BYTES}) and SECRET_READ_HEAP_RESERVE_BYTES (${appCfg.SECRET_READ_HEAP_RESERVE_BYTES}). Raise --max-old-space-size or lower those values`;
  if (isEnforced) throw new Error(`SECRET_READ_CONCURRENCY_LIMIT_MODE is enforce, but ${problem}`);

  logger.warn(
    `secretReadConcurrencyLimit: ${problem}. Until then every secret list request is reported as one the limit would refuse, and enforce mode would not start`
  );
  return 0;
};

export const secretReadConcurrencyLimit = fp(async (server) => {
  const appCfg = getConfig();
  const mode = appCfg.SECRET_READ_CONCURRENCY_LIMIT_MODE;
  if (mode === "off") {
    server.decorate("secretReadSlot", () => unlimitedSlot);
    return;
  }

  const isEnforced = mode === "enforce";
  const budget = computeSecretReadBudget(appCfg, isEnforced);
  let used = 0;
  registerSecretReadBudgetGauges({ getCapacity: () => budget, getUsed: () => used });

  // The weight is capped at the budget for this check only, so a read larger than the whole budget is let in when the
  // instance holds nothing instead of being refused on every attempt. It still adds its real weight to `used`, which
  // keeps every other read out until it finishes. Without the cap such a read could never run, and the retry the 503
  // asks for would never succeed.
  const hasRoomFor = (weight: number) => budget > 0 && used + Math.min(weight, budget) <= budget;

  const lastKnownSizes = new Map<string, number>();

  const rememberSize = (sizeKey: string, secretCount: number) => {
    lastKnownSizes.delete(sizeKey);
    lastKnownSizes.set(sizeKey, secretCount);
    if (lastKnownSizes.size > MAX_REMEMBERED_SIZES) {
      const [oldestKey] = lastKnownSizes.keys();
      lastKnownSizes.delete(oldestKey);
    }
  };

  let lastRefusalLogAt = 0;

  const logNoRoom = (req: FastifyRequest, weight: number) => {
    if (Date.now() - lastRefusalLogAt <= REFUSAL_LOG_INTERVAL_MS) return;
    lastRefusalLogAt = Date.now();
    logger.warn(
      `secretReadConcurrencyLimit: ${isEnforced ? "refused" : "would have refused"} a secret list request [orgId=${req.auth?.rootOrgId ?? "none"}] [weight=${weight}] [used=${used}] [capacity=${budget}]`
    );
  };

  server.decorate(
    "secretReadSlot",
    (req: FastifyRequest, reply: FastifyReply): TConcurrencySlot =>
      async (work, opts) => {
        const sizeKey = opts?.sizeKey;
        const lastKnownSize = sizeKey ? lastKnownSizes.get(sizeKey) : undefined;
        const estimate = lastKnownSize ?? appCfg.SECRET_READ_DEFAULT_SECRET_WEIGHT;
        let held = toWeight(estimate);

        if (!hasRoomFor(held)) {
          logNoRoom(req, held);
          recordSecretRateLimitExceededMetric({
            bucket: SecretRateLimitBucket.ReadBudget,
            outcome: isEnforced ? SecretRateLimitOutcome.Refused : SecretRateLimitOutcome.WouldRefuse,
            planSlug: req.rateLimitPlanSlug
          });
          if (isEnforced) {
            void reply.header("Retry-After", 1);
            throw new ServerBusyError({ message: REFUSAL_MESSAGE });
          }
        }

        used += held;
        let released = false;
        let reportedSize: number | undefined;
        try {
          return await work((secretCount) => {
            if (released) return;
            reportedSize = secretCount;
            const next = toWeight(secretCount);
            used += next - held;
            held = next;
          });
        } finally {
          released = true;
          used -= held;
          if (reportedSize !== undefined) {
            if (sizeKey) rememberSize(sizeKey, reportedSize);
            recordSecretReadSizeMetric({
              secretCount: reportedSize,
              estimate,
              estimateSource:
                lastKnownSize === undefined ? SecretReadEstimateSource.Default : SecretReadEstimateSource.LastKnown,
              planSlug: req.rateLimitPlanSlug
            });
          }
        }
      }
  );
});
