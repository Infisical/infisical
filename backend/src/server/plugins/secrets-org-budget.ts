import { FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { TConcurrencySlot } from "@app/lib/concurrency/concurrency-limiter";
import { getConfig } from "@app/lib/config/env";
import { RateLimitError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import {
  recordSecretOrgBudgetExceededMetric,
  recordSecretOrgBudgetUsageMetric,
  recordSecretRateLimitExceededMetric,
  SecretRateLimitBucket,
  SecretRateLimitOutcome
} from "@app/lib/telemetry/metrics";

export const SECRETS_PER_BUDGET_CREDIT = 100;

const BUDGET_WINDOW_IN_SECONDS = 60;
const FAILURE_LOG_INTERVAL_MS = 10_000;

export type TChargeSecretsOrgBudget = (secretCount: number) => void;

export type TSecretsOrgBudget = {
  check: () => Promise<void>;
  charge: TChargeSecretsOrgBudget;
};

type TSecretsOrgBudgetOptions = {
  keyStore: Pick<TKeyStoreFactory, "getItemPrimary" | "ttl" | "incrementByWithFixedExpiry">;
};

export const countReturnedSecrets = ({
  secrets,
  imports = []
}: {
  secrets: unknown[];
  imports?: { secrets: unknown[] }[];
}) => imports.reduce((count, { secrets: importedSecrets }) => count + importedSecrets.length, secrets.length);

export const secretsOrgBudgetCost = (secretCount: number) => Math.ceil(secretCount / SECRETS_PER_BUDGET_CREDIT);

const noBudget: TSecretsOrgBudget = { check: async () => {}, charge: () => {} };

export const secretImportSearchSlot =
  (orgBudget: TSecretsOrgBudget, readSlot: TConcurrencySlot): TConcurrencySlot =>
  async (work, opts) => {
    await orgBudget.check();
    let loadedSecretCount = 0;
    try {
      return await readSlot(
        (reportSize) =>
          work((secretCount) => {
            loadedSecretCount = Math.max(loadedSecretCount, secretCount);
            reportSize(secretCount);
          }),
        opts
      );
    } finally {
      orgBudget.charge(loadedSecretCount);
    }
  };

export const secretsOrgBudget = fp<TSecretsOrgBudgetOptions>(async (server, { keyStore }) => {
  const { SECRET_READ_ORG_BUDGET_MODE: mode, SECRET_READ_ORG_BUDGET: budget } = getConfig();
  if (mode === "off" || !server.hasDecorator("createRateLimit")) {
    server.decorate("secretsOrgBudget", () => noBudget);
    return;
  }

  let lastFailureLogAt = 0;
  const logFailure = (error: unknown, step: "read" | "charge", orgId: string) => {
    if (Date.now() - lastFailureLogAt <= FAILURE_LOG_INTERVAL_MS) return;
    lastFailureLogAt = Date.now();
    logger.warn(error, `secretsOrgBudget: failed to ${step} the secret read budget [orgId=${orgId}]`);
  };

  server.decorate("secretsOrgBudget", (req: FastifyRequest, reply: FastifyReply): TSecretsOrgBudget => {
    const orgId = req.auth?.rootOrgId;
    if (!orgId) return noBudget;

    const key = KeyStorePrefixes.SecretsOrgBudget(orgId);
    const planSlug = req.rateLimitPlanSlug;

    const check = async () => {
      let usedCredits = 0;
      try {
        // Read from the primary, which every charge writes to, so replica lag can't hide credits already spent.
        usedCredits = Number(await keyStore.getItemPrimary(key)) || 0;
      } catch (error) {
        logFailure(error, "read", orgId);
      }

      if (usedCredits < budget) return;

      if (mode === "enforce") {
        recordSecretRateLimitExceededMetric({
          bucket: SecretRateLimitBucket.OrgBudget,
          outcome: SecretRateLimitOutcome.Refused,
          planSlug
        });
        const ttl = await keyStore.ttl(key).catch(() => 0);
        const retryAfterInSeconds = ttl > 0 ? ttl : 1;
        void reply.header("Retry-After", retryAfterInSeconds);
        throw new RateLimitError({
          message: `Your organization read more secrets in the last minute than its limit allows. Please try again in ${retryAfterInSeconds} seconds`
        });
      }
      recordSecretRateLimitExceededMetric({
        bucket: SecretRateLimitBucket.OrgBudget,
        outcome: SecretRateLimitOutcome.WouldRefuse,
        planSlug
      });
    };

    const charge: TChargeSecretsOrgBudget = (secretCount) => {
      const cost = secretsOrgBudgetCost(secretCount);
      if (cost <= 0) return;
      void keyStore
        .incrementByWithFixedExpiry(key, cost, BUDGET_WINDOW_IN_SECONDS)
        .then((total) => {
          recordSecretOrgBudgetUsageMetric({ usedCredits: total, planSlug });

          const exceededCredits = total - budget;
          const didSpendLastOfBudget = exceededCredits >= 0 && exceededCredits < cost;
          if (!didSpendLastOfBudget) return;

          recordSecretOrgBudgetExceededMetric({ exceededCredits, planSlug });
          logger.info(
            `secretsOrgBudget: organization spent its secret read budget [orgId=${orgId}] [cost=${cost}] [used=${total}] [budget=${budget}] [exceeded=${exceededCredits}]`
          );
        })
        .catch((error) => logFailure(error, "charge", orgId));
    };

    return { check, charge };
  });
});
