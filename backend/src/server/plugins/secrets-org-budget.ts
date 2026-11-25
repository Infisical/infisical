import { FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";

import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { RateLimitError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import {
  recordSecretOrgBudgetUsageMetric,
  recordSecretRateLimitExceededMetric,
  SecretRateLimitBucket,
  SecretRateLimitOutcome
} from "@app/lib/telemetry/metrics";

export const SECRETS_PER_BUDGET_CREDIT = 100;

const BUDGET_WINDOW_IN_SECONDS = 60;
const FAILURE_LOG_INTERVAL_MS = 10_000;

export type TChargeSecretsOrgBudget = (secretCount: number) => void;

type TSecretsOrgBudgetOptions = {
  keyStore: Pick<TKeyStoreFactory, "getItem" | "ttl" | "incrementByWithFixedExpiry">;
};

export const countReturnedSecrets = ({
  secrets,
  imports = []
}: {
  secrets: unknown[];
  imports?: { secrets: unknown[] }[];
}) => imports.reduce((count, { secrets: importedSecrets }) => count + importedSecrets.length, secrets.length);

export const secretsOrgBudgetCost = (secretCount: number) => Math.ceil(secretCount / SECRETS_PER_BUDGET_CREDIT);

const chargeNothing: TChargeSecretsOrgBudget = () => {};

export const secretsOrgBudget = fp<TSecretsOrgBudgetOptions>(async (server, { keyStore }) => {
  const { SECRET_READ_ORG_BUDGET_MODE: mode, SECRET_READ_ORG_BUDGET: budget } = getConfig();
  if (mode === "off" || !server.hasDecorator("createRateLimit")) {
    server.decorate("secretsOrgBudget", async () => chargeNothing);
    return;
  }

  let lastFailureLogAt = 0;
  const logFailure = (error: unknown, step: "read" | "charge", orgId: string) => {
    if (Date.now() - lastFailureLogAt <= FAILURE_LOG_INTERVAL_MS) return;
    lastFailureLogAt = Date.now();
    logger.warn(error, `secretsOrgBudget: failed to ${step} the secret read budget [orgId=${orgId}]`);
  };

  server.decorate(
    "secretsOrgBudget",
    async (req: FastifyRequest, reply: FastifyReply): Promise<TChargeSecretsOrgBudget> => {
      const orgId = req.auth?.rootOrgId;
      if (!orgId) return chargeNothing;

      const key = KeyStorePrefixes.SecretsOrgBudget(orgId);
      const planSlug = req.rateLimitPlanSlug;

      let usedCredits = 0;
      try {
        usedCredits = Number(await keyStore.getItem(key)) || 0;
      } catch (error) {
        logFailure(error, "read", orgId);
      }

      if (usedCredits >= budget) {
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
      }

      return (secretCount) => {
        const cost = secretsOrgBudgetCost(secretCount);
        if (cost <= 0) return;
        void keyStore
          .incrementByWithFixedExpiry(key, cost, BUDGET_WINDOW_IN_SECONDS)
          .then((total) => recordSecretOrgBudgetUsageMetric({ usedCredits: total, planSlug }))
          .catch((error) => logFailure(error, "charge", orgId));
      };
    }
  );
});
