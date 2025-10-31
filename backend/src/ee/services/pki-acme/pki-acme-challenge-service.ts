import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TPkiAcmeChallengeDALFactory } from "./pki-acme-challenge-dal";
import { AcmeAuthStatus, AcmeChallengeStatus, AcmeChallengeType } from "./pki-acme-schemas";
import { TPkiAcmeChallengeServiceFactory } from "./pki-acme-types";
import { getConfig } from "@app/lib/config/env";
import { calculateJwkThumbprint } from "jose";

type TPkiAcmeChallengeServiceFactoryDep = {
  acmeChallengeDAL: Pick<TPkiAcmeChallengeDALFactory, "transaction" | "findByIdWithAuthForUpdate">;
};

export const pkiAcmeChallengeServiceFactory = ({
  acmeChallengeDAL
}: TPkiAcmeChallengeServiceFactoryDep): TPkiAcmeChallengeServiceFactory => {
  const appCfg = getConfig();

  const validateChallengeResponse = async (challengeId: string): Promise<void> => {
    return await acmeChallengeDAL.transaction(async (tx) => {
      const challenge = await acmeChallengeDAL.findByIdWithAuthForUpdate(challengeId, tx);
      if (!challenge) {
        throw new NotFoundError({ message: "ACME challenge not found" });
      }
      if (challenge.status !== AcmeChallengeStatus.Processing) {
        throw new BadRequestError({
          message: `ACME challenge is ${challenge.status} instead of ${AcmeChallengeStatus.Processing}`
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

      const challengeUrl = new URL(`/.well-known/acme-challenge/${challenge.token}`, actualBaseUrl);
      const challengeResponse = await fetch(challengeUrl);
      if (challengeResponse.status !== 200) {
        throw new BadRequestError({ message: "ACME challenge response is not 200" });
      }
      const challengeResponseBody = await challengeResponse.text();
      const expectedChallengeResponseBody = `${challenge.token}.${challenge.auth.identifierValue}`;
    });
  };

  return { validateChallengeResponse };
};
