import axios, { AxiosError } from "axios";

import { TPkiAcmeChallenges } from "@app/db/schemas/pki-acme-challenges";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { isPrivateIp } from "@app/lib/ip/ipRange";
import { logger } from "@app/lib/logger";

import { TPkiAcmeChallengeDALFactory } from "./pki-acme-challenge-dal";
import {
  AcmeConnectionError,
  AcmeDnsFailureError,
  AcmeIncorrectResponseError,
  AcmeServerInternalError
} from "./pki-acme-errors";
import { AcmeAuthStatus, AcmeChallengeStatus, AcmeChallengeType } from "./pki-acme-schemas";
import { TPkiAcmeChallengeServiceFactory } from "./pki-acme-types";

type TPkiAcmeChallengeServiceFactoryDep = {
  acmeChallengeDAL: Pick<
    TPkiAcmeChallengeDALFactory,
    | "transaction"
    | "findByIdForChallengeValidation"
    | "markAsValidCascadeById"
    | "markAsInvalidCascadeById"
    | "updateById"
  >;
};

export const pkiAcmeChallengeServiceFactory = ({
  acmeChallengeDAL
}: TPkiAcmeChallengeServiceFactoryDep): TPkiAcmeChallengeServiceFactory => {
  const appCfg = getConfig();
  const markChallengeAsReady = async (challengeId: string): Promise<TPkiAcmeChallenges> => {
    return acmeChallengeDAL.transaction(async (tx) => {
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
      const host = challenge.auth.identifierValue;
      // check if host is a private ip address
      if (isPrivateIp(host)) {
        throw new BadRequestError({ message: "Private IP addresses are not allowed" });
      }
      return acmeChallengeDAL.updateById(challengeId, { status: AcmeChallengeStatus.Processing }, tx);
    });
  };

  const validateChallengeResponse = async (challengeId: string, retryCount: number): Promise<void> => {
    logger.info({ challengeId, retryCount }, "Validating ACME challenge response");
    const challenge = await acmeChallengeDAL.findByIdForChallengeValidation(challengeId);
    if (!challenge) {
      throw new NotFoundError({ message: "ACME challenge not found" });
    }
    if (challenge.status !== AcmeChallengeStatus.Processing) {
      throw new BadRequestError({
        message: `ACME challenge is ${challenge.status} instead of ${AcmeChallengeStatus.Processing}`
      });
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
      // TODO: read config from the profile to get the timeout instead
      const timeoutMs = 10 * 1000; // 10 seconds
      // Notice: well, we are in a transaction, ideally we should not hold transaction and perform
      //         a long running operation for long time. But assuming we are not performing a tons of
      //         challenge validation at the same time, it should be fine.
      const challengeResponse = await axios.get<string>(challengeUrl.toString(), {
        // In case if we override the hos2 in the development mode, still provide the original host in the header
        // to help the upstream server to validate the request
        headers: { Host: challenge.auth.identifierValue },
        timeout: timeoutMs,
        responseType: "text",
        validateStatus: () => true
      });
      if (challengeResponse.status !== 200) {
        throw new AcmeIncorrectResponseError({
          message: `ACME challenge response is not 200: ${challengeResponse.status}`
        });
      }
      const challengeResponseBody: string = challengeResponse.data;
      const thumbprint = challenge.auth.account.publicKeyThumbprint;
      const expectedChallengeResponseBody = `${challenge.auth.token}.${thumbprint}`;
      if (challengeResponseBody.trimEnd() !== expectedChallengeResponseBody) {
        throw new AcmeIncorrectResponseError({ message: "ACME challenge response is not correct" });
      }
      await acmeChallengeDAL.markAsValidCascadeById(challengeId);
    } catch (exp) {
      if (retryCount >= 2) {
        // This is the last attempt to validate the challenge response, if it fails, we mark the challenge as invalid
        await acmeChallengeDAL.markAsInvalidCascadeById(challengeId);
      }
      // Properly type and inspect the error
      if (axios.isAxiosError(exp)) {
        const axiosError = exp as AxiosError;
        const errorCode = axiosError.code;
        const errorMessage = axiosError.message;

        if (errorCode === "ECONNREFUSED" || errorMessage.includes("ECONNREFUSED")) {
          throw new AcmeConnectionError({ message: "Connection refused" });
        }
        if (errorCode === "ENOTFOUND" || errorMessage.includes("ENOTFOUND")) {
          throw new AcmeDnsFailureError({ message: "Hostname could not be resolved (DNS failure)" });
        }
        if (errorCode === "ECONNABORTED" || errorMessage.includes("timeout")) {
          logger.error(exp, "Connection timed out while validating ACME challenge response");
          throw new AcmeConnectionError({ message: "Connection timed out" });
        }
        logger.error(exp, "Unknown error validating ACME challenge response");
        throw new AcmeServerInternalError({ message: "Unknown error validating ACME challenge response" });
      }
      if (exp instanceof Error) {
        logger.error(exp, "Error validating ACME challenge response");
        throw exp;
      }
      logger.error(exp, "Unknown error validating ACME challenge response");
      throw new AcmeServerInternalError({ message: "Unknown error validating ACME challenge response" });
    }
  };

  return { markChallengeAsReady, validateChallengeResponse };
};
