import { Knex } from "knex";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TPkiAcmeAuthDALFactory } from "./pki-acme-auth-dal";
import { TPkiAcmeChallengeDALFactory } from "./pki-acme-challenge-dal";
import { AcmeAuthStatus, AcmeChallengeStatus, AcmeChallengeType } from "./pki-acme-schemas";
import { TPkiAcmeChallengeServiceFactory } from "./pki-acme-types";

type TPkiAcmeChallengeServiceFactoryDep = {
  acmeAuthDAL: Pick<TPkiAcmeAuthDALFactory, "updateById">;
  acmeChallengeDAL: Pick<TPkiAcmeChallengeDALFactory, "transaction" | "findByIdForChallengeValidation" | "updateById">;
};

export const pkiAcmeChallengeServiceFactory = ({
  acmeAuthDAL,
  acmeChallengeDAL
}: TPkiAcmeChallengeServiceFactoryDep): TPkiAcmeChallengeServiceFactory => {
  const appCfg = getConfig();

  const validateChallengeResponse = async (challengeId: string, tx?: Knex): Promise<void> => {
    return await acmeChallengeDAL.transaction(async (tx: Knex) => {
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
      const baseUrl = `http://${challenge.auth.identifierValue}`;
      const actualBaseUrl = appCfg.isAcmeDevelopmentMode
        ? `${baseUrl}:${appCfg.ACME_DEVELOPMENT_HTTP01_CHALLENGE_PORT}`
        : baseUrl;
      const challengeUrl = new URL(`/.well-known/acme-challenge/${challenge.auth.token}`, actualBaseUrl);
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
        const thumbprint = Buffer.from(challenge.auth.account.publicKeyThumbprint, "utf-8").toString("base64url");
        const expectedChallengeResponseBody = `${challenge.auth.token}.${thumbprint}`;
        if (challengeResponseBody !== expectedChallengeResponseBody) {
          throw new BadRequestError({ message: "ACME challenge response is not correct" });
        }
        await acmeChallengeDAL.updateById(
          challengeId,
          { status: AcmeChallengeStatus.Valid, validatedAt: new Date() },
          tx
        );
        await acmeAuthDAL.updateById(challenge.auth.account.id, { status: AcmeAuthStatus.Valid }, tx);
        await acmeAuthDAL.updateById(challenge.auth.account.id, { status: AcmeAuthStatus.Valid }, tx);
      } catch (error) {
        logger.error(error, "Error validating ACME challenge response");
        // TODO: we should retry the challenge validation a few times, but let's keep it simple for now
        await acmeChallengeDAL.updateById(challengeId, { status: AcmeChallengeStatus.Invalid }, tx);
        await acmeAuthDAL.updateById(challenge.auth.account.id, { status: AcmeAuthStatus.Invalid }, tx);
        throw error;
      }
    });
  };

  return { validateChallengeResponse };
};
