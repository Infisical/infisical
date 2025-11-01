import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TPkiAcmeAuthDALFactory } from "./pki-acme-auth-dal";
import { TPkiAcmeChallengeDALFactory } from "./pki-acme-challenge-dal";
import { AcmeConnectionError, AcmeDnsFailureError, AcmeIncorrectResponseError } from "./pki-acme-errors";
import { AcmeAuthStatus, AcmeChallengeStatus, AcmeChallengeType } from "./pki-acme-schemas";
import { TPkiAcmeChallengeServiceFactory } from "./pki-acme-types";

type TPkiAcmeChallengeServiceFactoryDep = {
  acmeAuthDAL: Pick<TPkiAcmeAuthDALFactory, "updateById">;
  acmeChallengeDAL: Pick<
    TPkiAcmeChallengeDALFactory,
    "transaction" | "findByIdForChallengeValidation" | "markAsValidCascadeById" | "markAsInvalidCascadeById"
  >;
};

export const pkiAcmeChallengeServiceFactory = ({
  acmeAuthDAL,
  acmeChallengeDAL
}: TPkiAcmeChallengeServiceFactoryDep): TPkiAcmeChallengeServiceFactory => {
  const appCfg = getConfig();

  const validateChallengeResponse = async (challengeId: string): Promise<void> => {
    const error = await acmeChallengeDAL.transaction(async (tx) => {
      logger.info({ challengeId }, "Validating ACME challenge response");
      const challenge = await acmeChallengeDAL.findByIdForChallengeValidation(challengeId, tx);
      if (!challenge) {
        throw new NotFoundError({ message: "ACME challenge not found" });
      }
      if (challenge.status !== AcmeChallengeStatus.Pending) {
        throw new BadRequestError({
          message: `ACME challenge is ${challenge.status} instead of ${AcmeChallengeStatus.Pending}`
        });
      }
      if (challenge.auth.expiresAt < new Date()) {
        throw new BadRequestError({ message: "ACME auth has expired" });
      }
      if (challenge.auth.status !== AcmeAuthStatus.Pending) {
        throw new BadRequestError({
          message: `ACME auth status is ${challenge.auth.status} instead of ${AcmeAuthStatus.Pending}`
        });
      }

      // TODO: support other challenge types here. Currently only HTTP-01 is supported
      if (challenge.type !== AcmeChallengeType.HTTP_01) {
        throw new BadRequestError({ message: "Only HTTP-01 challenges are supported for now" });
      }
      let host = challenge.auth.identifierValue;
      if (appCfg.isAcmeDevelopmentMode && appCfg.ACME_DEVELOPMENT_HTTP01_CHALLENGE_HOST_OVERRIDES[host]) {
        host = appCfg.ACME_DEVELOPMENT_HTTP01_CHALLENGE_HOST_OVERRIDES[host];
        logger.warn(
          { srcHost: challenge.auth.identifierValue, dstHost: host },
          "Using ACME development HTTP-01 challenge host override"
        );
      }
      const challengeUrl = new URL(`/.well-known/acme-challenge/${challenge.auth.token}`, `http://${host}`);
      logger.info({ challengeUrl }, "Performing ACME HTTP-01 challenge validation");
      try {
        // Notice: well, we are in a transaction, ideally we should not hold transaction and perform
        //         a long running operation for long time. But assuming we are not performing a tons of
        //         challenge validation at the same time, it should be fine.
        // TODO: bound it with timeout of the fetch request
        const challengeResponse = await fetch(challengeUrl);
        if (challengeResponse.status !== 200) {
          throw new BadRequestError({ message: "ACME challenge response is not 200" });
        }
        const challengeResponseBody = await challengeResponse.text();
        const thumbprint = challenge.auth.account.publicKeyThumbprint;
        const expectedChallengeResponseBody = `${challenge.auth.token}.${thumbprint}`;
        if (challengeResponseBody.trimEnd() !== expectedChallengeResponseBody) {
          throw new AcmeIncorrectResponseError({ message: "ACME challenge response is not correct" });
        }
        await acmeChallengeDAL.markAsValidCascadeById(challengeId, tx);
      } catch (error) {
        // TODO: we should retry the challenge validation a few times, but let's keep it simple for now
        await acmeChallengeDAL.markAsInvalidCascadeById(challengeId, tx);
        // Properly type and inspect the error
        if (error instanceof TypeError && error.message.includes("fetch failed")) {
          const cause = error.cause;
          const errors = cause instanceof AggregateError ? cause.errors : cause instanceof Error ? [cause] : [];
          for (const err of errors) {
            // TODO: handle multiple errors, return a compound error instead of just the first error
            if (err?.code === "ECONNREFUSED" || err?.message?.includes("ECONNREFUSED")) {
              return new AcmeConnectionError({ message: "Connection refused" });
            } else if (err?.code === "ENOTFOUND" || err?.message?.includes("ENOTFOUND")) {
              return new AcmeDnsFailureError({ message: "Hostname could not be resolved (DNS failure)" });
            }
          }
        } else if (error instanceof Error) {
          logger.error(error, "Error validating ACME challenge response");
        } else {
          logger.error(error, "Unknown error validating ACME challenge response");
        }
        return error;
      }
    });
    if (error) {
      throw error;
    }
  };

  return { validateChallengeResponse };
};
