import { resolve4, Resolver } from "node:dns/promises";

import axios, { AxiosError } from "axios";

import { TPkiAcmeChallenges } from "@app/db/schemas/pki-acme-challenges";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { isValidIp } from "@app/lib/ip";
import { isPrivateIp } from "@app/lib/ip/ipRange";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";

import { EventType, TAuditLogServiceFactory } from "../audit-log/audit-log-types";
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
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
};

export const pkiAcmeChallengeServiceFactory = ({
  acmeChallengeDAL,
  auditLogService
}: TPkiAcmeChallengeServiceFactoryDep): TPkiAcmeChallengeServiceFactory => {
  const appCfg = getConfig();

  type ChallengeWithAuth = NonNullable<Awaited<ReturnType<typeof acmeChallengeDAL.findByIdForChallengeValidation>>>;

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
      const host = challenge.auth.identifierValue;
      // check if host is a private ip address
      if (isPrivateIp(host)) {
        throw new BadRequestError({ message: "Private IP addresses are not allowed" });
      }
      if (challenge.type !== AcmeChallengeType.HTTP_01 && challenge.type !== AcmeChallengeType.DNS_01) {
        throw new BadRequestError({ message: "Only HTTP-01 or DNS-01 challenges are supported for now" });
      }
      return acmeChallengeDAL.updateById(challengeId, { status: AcmeChallengeStatus.Processing }, tx);
    });
  };

  const validateHttp01Challenge = async (challenge: ChallengeWithAuth): Promise<void> => {
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

    // TODO: read config from the profile to get the timeout instead
    const timeoutMs = 10 * 1000; // 10 seconds
    // Notice: well, we are in a transaction, ideally we should not hold transaction and perform
    //         a long running operation for long time. But assuming we are not performing a tons of
    //         challenge validation at the same time, it should be fine.
    const challengeResponse = await axios.get<string>(challengeUrl.toString(), {
      // In case if we override the host in the development mode, still provide the original host in the header
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
      throw new AcmeIncorrectResponseError({ message: "ACME HTTP-01 challenge response is not correct" });
    }
  };

  const validateDns01Challenge = async (challenge: ChallengeWithAuth): Promise<void> => {
    const resolver = new Resolver();
    if (appCfg.ACME_DNS_RESOLVER_SERVERS.length > 0) {
      const servers = appCfg.ACME_DNS_RESOLVE_RESOLVER_SERVERS_HOST_ENABLED
        ? await Promise.all(
            appCfg.ACME_DNS_RESOLVER_SERVERS.map(async (server) => {
              if (isValidIp(server)) {
                return server;
              }
              const ips = await resolve4(server);
              return ips[0];
            })
          )
        : appCfg.ACME_DNS_RESOLVER_SERVERS;
      resolver.setServers(servers);
    }

    const recordName = `_acme-challenge.${challenge.auth.identifierValue}`;
    const records = await resolver.resolveTxt(recordName);
    const recordValues = records.map((chunks) => chunks.join(""));

    const thumbprint = challenge.auth.account.publicKeyThumbprint;
    const keyAuthorization = `${challenge.auth.token}.${thumbprint}`;
    const digest = crypto.nativeCrypto.createHash("sha256").update(keyAuthorization).digest();
    const expectedChallengeResponseValue = Buffer.from(digest).toString("base64url");

    if (!recordValues.some((recordValue) => recordValue.trim() === expectedChallengeResponseValue)) {
      throw new AcmeIncorrectResponseError({ message: "ACME DNS-01 challenge response is not correct" });
    }
  };

  const handleChallengeValidationError = async (
    exp: unknown,
    challenge: ChallengeWithAuth,
    challengeId: string,
    retryCount: number
  ): Promise<never> => {
    let finalAttempt = false;
    if (retryCount >= 2) {
      logger.error(
        exp,
        `Last attempt to validate ACME challenge response failed, marking ${challengeId} challenge as invalid`
      );
      // This is the last attempt to validate the challenge response, if it fails, we mark the challenge as invalid
      await acmeChallengeDAL.markAsInvalidCascadeById(challengeId);
      finalAttempt = true;
    }

    try {
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
        if (errorCode === "ECONNRESET" || errorMessage.includes("ECONNRESET")) {
          throw new AcmeConnectionError({ message: "Connection reset by peer" });
        }
        if (errorCode === "ECONNABORTED" || errorMessage.includes("timeout")) {
          logger.error(exp, "Connection timed out while validating ACME challenge response");
          throw new AcmeConnectionError({ message: "Connection timed out" });
        }
        logger.error(exp, "Unknown error validating ACME challenge response");
        throw new AcmeServerInternalError({ message: "Unknown error validating ACME challenge response" });
      }
      if (exp instanceof Error) {
        if ((exp as unknown as { code?: string })?.code === "ENOTFOUND") {
          throw new AcmeDnsFailureError({ message: "Hostname could not be resolved (DNS failure)" });
        }
        logger.error(exp, "Error validating ACME challenge response");
        throw exp;
      }
      logger.error(exp, "Unknown error validating ACME challenge response");
      throw new AcmeServerInternalError({ message: "Unknown error validating ACME challenge response" });
    } catch (outterExp) {
      await auditLogService.createAuditLog({
        projectId: challenge.auth.account.project.id,
        actor: {
          type: ActorType.ACME_ACCOUNT,
          metadata: {
            profileId: challenge.auth.account.profileId,
            accountId: challenge.auth.account.id
          }
        },
        event: {
          type: finalAttempt ? EventType.FAIL_ACME_CHALLENGE : EventType.ATTEMPT_ACME_CHALLENGE,
          metadata: {
            challengeId,
            type: challenge.type as AcmeChallengeType,
            retryCount,
            errorMessage: exp instanceof Error ? exp.message : "Unknown error"
          }
        }
      });
      throw outterExp;
    }
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

    try {
      if (challenge.type === AcmeChallengeType.HTTP_01) {
        await validateHttp01Challenge(challenge);
      } else if (challenge.type === AcmeChallengeType.DNS_01) {
        await validateDns01Challenge(challenge);
      } else {
        throw new BadRequestError({ message: `Unsupported challenge type: ${challenge.type}` });
      }

      logger.info({ challengeId }, "ACME challenge response is correct, marking challenge as valid");
      await acmeChallengeDAL.markAsValidCascadeById(challengeId);
      await auditLogService.createAuditLog({
        projectId: challenge.auth.account.project.id,
        actor: {
          type: ActorType.ACME_ACCOUNT,
          metadata: {
            profileId: challenge.auth.account.profileId,
            accountId: challenge.auth.account.id
          }
        },
        event: {
          type: EventType.PASS_ACME_CHALLENGE,
          metadata: {
            challengeId,
            type: challenge.type as AcmeChallengeType
          }
        }
      });
    } catch (exp) {
      await handleChallengeValidationError(exp, challenge, challengeId, retryCount);
    }
  };

  return { markChallengeAsReady, validateChallengeResponse };
};
