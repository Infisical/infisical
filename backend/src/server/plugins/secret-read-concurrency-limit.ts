import os from "node:os";

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
const ORG_SHARE_OF_BUDGET = 0.25;
const REFUSAL_MESSAGE = "This request could not be completed. Please retry";

const unlimitedSlot: TConcurrencySlot = (work) => work(() => {});

const toWeight = (secretCount: number) => Math.max(1, Math.ceil(secretCount));

const resolveMemoryLimit = () => {
  const containerLimit = process.constrainedMemory();
  const hostMemory = os.totalmem();
  const hasContainerLimit = containerLimit > 0 && containerLimit < hostMemory;
  return hasContainerLimit
    ? { bytes: containerLimit, name: "container memory limit", remedy: "Raise the container's memory limit" }
    : { bytes: hostMemory, name: "host memory", remedy: "Add memory to the host" };
};

const computeSecretReadBudget = (
  appCfg: Pick<
    TEnvConfig,
    "SECRET_READ_HEAP_BASELINE_BYTES" | "SECRET_READ_HEAP_RESERVE_BYTES" | "SECRET_READ_PEAK_BYTES_PER_SECRET"
  >,
  isEnforced: boolean
) => {
  const memoryLimit = resolveMemoryLimit();
  const available = memoryLimit.bytes - appCfg.SECRET_READ_HEAP_BASELINE_BYTES - appCfg.SECRET_READ_HEAP_RESERVE_BYTES;
  const budget = Math.floor(available / appCfg.SECRET_READ_PEAK_BYTES_PER_SECRET);
  if (budget >= 1) {
    logger.info(
      `secretReadConcurrencyLimit: secret list requests can hold ${budget} secrets in memory at once, sized from the ${memoryLimit.name} [memoryLimit=${memoryLimit.bytes}]`
    );
    return budget;
  }

  const problem = `the ${memoryLimit.name} (${memoryLimit.bytes} bytes) leaves no room for secret list requests after SECRET_READ_HEAP_BASELINE_BYTES (${appCfg.SECRET_READ_HEAP_BASELINE_BYTES}) and SECRET_READ_HEAP_RESERVE_BYTES (${appCfg.SECRET_READ_HEAP_RESERVE_BYTES}). ${memoryLimit.remedy} or lower those values`;
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
  const isMultiTenant = server.hasDecorator("createRateLimit");
  const orgCapacity = isMultiTenant && budget > 0 ? Math.max(1, Math.floor(budget * ORG_SHARE_OF_BUDGET)) : 0;
  let used = 0;
  const usedByOrg = new Map<string, number>();
  registerSecretReadBudgetGauges({ getCapacity: () => budget, getUsed: () => used });

  const getOrgUsed = (orgId?: string) => (orgId ? (usedByOrg.get(orgId) ?? 0) : 0);

  const hold = (orgId: string | undefined, delta: number) => {
    used += delta;
    if (!orgId || orgCapacity === 0) return;
    const orgUsed = getOrgUsed(orgId) + delta;
    if (orgUsed > 0) usedByOrg.set(orgId, orgUsed);
    else usedByOrg.delete(orgId);
  };

  // The weight is capped at the capacity for this check only, so a read larger than the whole budget is let in when the
  // instance holds nothing instead of being refused on every attempt. It still adds its real weight to `used`, which
  // keeps every other read out until it finishes. Without the cap such a read could never run, and the retry the 503
  // asks for would never succeed. An organization's share follows the same rule: a read larger than the share runs
  // when the organization holds nothing else.
  const fits = (capacity: number, usedNow: number, weight: number, alreadyHeld: number) =>
    capacity > 0 && usedNow - alreadyHeld + Math.min(weight, capacity) <= capacity;

  const findFullBucket = (orgId: string | undefined, weight: number, alreadyHeld = 0) => {
    if (orgId && orgCapacity > 0 && !fits(orgCapacity, getOrgUsed(orgId), weight, alreadyHeld)) {
      return SecretRateLimitBucket.ReadBudgetOrgShare;
    }
    return fits(budget, used, weight, alreadyHeld) ? undefined : SecretRateLimitBucket.ReadBudget;
  };

  const lastKnownSizes = new Map<string, number>();

  const rememberSize = (sizeKey: string, secretCount: number) => {
    lastKnownSizes.delete(sizeKey);
    lastKnownSizes.set(sizeKey, secretCount);
    if (lastKnownSizes.size > MAX_REMEMBERED_SIZES) {
      const [oldestKey] = lastKnownSizes.keys();
      lastKnownSizes.delete(oldestKey);
    }
  };

  const lastRefusalLogAt = new Map<SecretRateLimitBucket, number>();

  const logNoRoom = (req: FastifyRequest, bucket: SecretRateLimitBucket, weight: number) => {
    if (Date.now() - (lastRefusalLogAt.get(bucket) ?? 0) <= REFUSAL_LOG_INTERVAL_MS) return;
    lastRefusalLogAt.set(bucket, Date.now());
    const orgId = req.auth?.rootOrgId;
    const orgShare = orgCapacity > 0 ? ` [orgUsed=${getOrgUsed(orgId)}] [orgCapacity=${orgCapacity}]` : "";
    logger.warn(
      `secretReadConcurrencyLimit: ${isEnforced ? "refused" : "would have refused"} a secret list request [bucket=${bucket}] [orgId=${orgId ?? "none"}] [weight=${weight}] [used=${used}] [capacity=${budget}]${orgShare}`
    );
  };

  const refuseIfEnforced = (
    req: FastifyRequest,
    reply: FastifyReply,
    bucket: SecretRateLimitBucket,
    weight: number
  ) => {
    logNoRoom(req, bucket, weight);
    recordSecretRateLimitExceededMetric({
      bucket,
      outcome: isEnforced ? SecretRateLimitOutcome.Refused : SecretRateLimitOutcome.WouldRefuse,
      planSlug: req.rateLimitPlanSlug
    });
    if (isEnforced) {
      void reply.header("Retry-After", 1);
      throw new ServerBusyError({ message: REFUSAL_MESSAGE });
    }
  };

  server.decorate(
    "secretReadSlot",
    (req: FastifyRequest, reply: FastifyReply): TConcurrencySlot =>
      async (work, opts) => {
        const sizeKey = opts?.sizeKey;
        const lastKnownSize = sizeKey ? lastKnownSizes.get(sizeKey) : undefined;
        const estimate = lastKnownSize ?? appCfg.SECRET_READ_DEFAULT_SECRET_WEIGHT;
        let held = toWeight(estimate);
        const orgId = req.auth?.rootOrgId;

        const fullBucketAtAdmission = findFullBucket(orgId, held);
        let refusalRecorded = fullBucketAtAdmission !== undefined;
        if (fullBucketAtAdmission) refuseIfEnforced(req, reply, fullBucketAtAdmission, held);

        hold(orgId, held);
        let released = false;
        let reportedSize: number | undefined;
        try {
          return await work((secretCount) => {
            if (released) return;
            reportedSize = secretCount;
            const next = toWeight(secretCount);
            // Admission ran on an estimate, so a read that turns out larger than the room left is refused here, before
            // the work it would still do (decryption, reference expansion) grows the heap further.
            // Observe mode records one refusal per request, as enforce mode would refuse it only once.
            const fullBucket = !refusalRecorded && next > held ? findFullBucket(orgId, next, held) : undefined;
            if (fullBucket) {
              refusalRecorded = true;
              refuseIfEnforced(req, reply, fullBucket, next);
            }
            hold(orgId, next - held);
            held = next;
          });
        } finally {
          released = true;
          hold(orgId, -held);
          if (reportedSize !== undefined) {
            if (sizeKey) rememberSize(sizeKey, reportedSize);
            recordSecretReadSizeMetric({
              secretCount: reportedSize,
              estimate,
              estimateSource:
                lastKnownSize === undefined ? SecretReadEstimateSource.Default : SecretReadEstimateSource.LastKnown
            });
          }
        }
      }
  );
});
