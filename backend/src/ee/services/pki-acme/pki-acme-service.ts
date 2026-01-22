import * as x509 from "@peculiar/x509";
import {
  calculateJwkThumbprint,
  errors,
  flattenedVerify,
  FlattenedVerifyResult,
  importJWK,
  JWSHeaderParameters
} from "jose";
import { Knex } from "knex";
import { z, ZodError } from "zod";

import { TPkiAcmeOrders } from "@app/db/schemas";
import { TPkiAcmeAccounts } from "@app/db/schemas/pki-acme-accounts";
import { TPkiAcmeAuths } from "@app/db/schemas/pki-acme-auths";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { isPrivateIp } from "@app/lib/ip/ipRange";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { CertSubjectAlternativeNameType } from "@app/services/certificate/certificate-types";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";
import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";
import {
  TCertificateIssuanceQueueFactory,
  TIssueCertificateFromProfileJobData
} from "@app/services/certificate-authority/certificate-issuance-queue";
import {
  extractAlgorithmsFromCSR,
  extractCertificateRequestFromCSR
} from "@app/services/certificate-common/certificate-csr-utils";
import { TCertificatePolicyDALFactory } from "@app/services/certificate-policy/certificate-policy-dal";
import { TCertificatePolicyServiceFactory } from "@app/services/certificate-policy/certificate-policy-service";
import { TCertificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";
import {
  EnrollmentType,
  TCertificateProfileWithConfigs
} from "@app/services/certificate-profile/certificate-profile-types";
import { TCertificateRequestServiceFactory } from "@app/services/certificate-request/certificate-request-service";
import { CertificateRequestStatus } from "@app/services/certificate-request/certificate-request-types";
import { TCertificateV3ServiceFactory } from "@app/services/certificate-v3/certificate-v3-service";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { EventType, TAuditLogServiceFactory } from "../audit-log/audit-log-types";
import { TPkiAcmeAccountDALFactory } from "./pki-acme-account-dal";
import { TPkiAcmeAuthDALFactory } from "./pki-acme-auth-dal";
import { TPkiAcmeChallengeDALFactory } from "./pki-acme-challenge-dal";
import {
  AcmeAccountDoesNotExistError,
  AcmeBadCSRError,
  AcmeBadNonceError,
  AcmeBadPublicKeyError,
  AcmeError,
  AcmeExternalAccountRequiredError,
  AcmeMalformedError,
  AcmeOrderNotReadyError,
  AcmeServerInternalError,
  AcmeUnsupportedIdentifierError
} from "./pki-acme-errors";
import { buildUrl, extractAccountIdFromKid, validateDnsIdentifier } from "./pki-acme-fns";
import { TPkiAcmeOrderAuthDALFactory } from "./pki-acme-order-auth-dal";
import { TPkiAcmeOrderDALFactory } from "./pki-acme-order-dal";
import { TPkiAcmeQueueServiceFactory } from "./pki-acme-queue";
import {
  AcmeAuthStatus,
  AcmeChallengeStatus,
  AcmeChallengeType,
  AcmeIdentifierType,
  AcmeOrderStatus,
  CreateAcmeAccountBodySchema,
  ProtectedHeaderSchema
} from "./pki-acme-schemas";
import {
  TAcmeOrderResource,
  TAcmeResponse,
  TAuthenciatedJwsPayload,
  TCreateAcmeAccountPayload,
  TCreateAcmeAccountResponse,
  TCreateAcmeOrderPayload,
  TDeactivateAcmeAccountPayload,
  TDeactivateAcmeAccountResponse,
  TFinalizeAcmeOrderPayload,
  TGetAcmeAuthorizationResponse,
  TGetAcmeDirectoryResponse,
  TJwsPayload,
  TListAcmeOrdersResponse,
  TPkiAcmeChallengeServiceFactory,
  TPkiAcmeServiceFactory,
  TRawJwsPayload,
  TRespondToAcmeChallengeResponse
} from "./pki-acme-types";

type TPkiAcmeServiceFactoryDep = {
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction" | "findById">;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "findByIdWithAssociatedCa">;
  certificateProfileDAL: Pick<TCertificateProfileDALFactory, "findByIdWithOwnerOrgId" | "findByIdWithConfigs">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "findOne" | "create">;
  certificatePolicyDAL: Pick<TCertificatePolicyDALFactory, "findById">;
  acmeAccountDAL: Pick<
    TPkiAcmeAccountDALFactory,
    "findByProjectIdAndAccountId" | "findByProfileIdAndPublicKeyThumbprintAndAlg" | "create"
  >;
  acmeOrderDAL: Pick<
    TPkiAcmeOrderDALFactory,
    | "findById"
    | "create"
    | "transaction"
    | "updateById"
    | "findByAccountAndOrderIdWithAuthorizations"
    | "findByIdForFinalization"
    | "findWithCertificateRequestForSync"
    | "listByAccountId"
  >;
  acmeAuthDAL: Pick<TPkiAcmeAuthDALFactory, "create" | "findByAccountIdAndAuthIdWithChallenges">;
  acmeOrderAuthDAL: Pick<TPkiAcmeOrderAuthDALFactory, "insertMany">;
  acmeChallengeDAL: Pick<
    TPkiAcmeChallengeDALFactory,
    "create" | "transaction" | "updateById" | "findByAccountAuthAndChallengeId" | "findByIdForChallengeValidation"
  >;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry" | "deleteItem">;
  kmsService: Pick<
    TKmsServiceFactory,
    "decryptWithKmsKey" | "generateKmsKey" | "encryptWithKmsKey" | "createCipherPairWithDataKey"
  >;
  certificateV3Service: Pick<TCertificateV3ServiceFactory, "signCertificateFromProfile">;
  certificatePolicyService: Pick<TCertificatePolicyServiceFactory, "validateCertificateRequest">;
  certificateRequestService: Pick<TCertificateRequestServiceFactory, "createCertificateRequest">;
  certificateIssuanceQueue: Pick<TCertificateIssuanceQueueFactory, "queueCertificateIssuance">;
  acmeChallengeService: Pick<TPkiAcmeChallengeServiceFactory, "markChallengeAsReady">;
  pkiAcmeQueueService: Pick<TPkiAcmeQueueServiceFactory, "queueChallengeValidation">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
};

export const pkiAcmeServiceFactory = ({
  projectDAL,
  certificateAuthorityDAL,
  certificateProfileDAL,
  certificateBodyDAL,
  certificatePolicyDAL,
  acmeAccountDAL,
  acmeOrderDAL,
  acmeAuthDAL,
  acmeOrderAuthDAL,
  acmeChallengeDAL,
  keyStore,
  kmsService,
  certificateV3Service,
  certificatePolicyService,
  certificateRequestService,
  certificateIssuanceQueue,
  acmeChallengeService,
  pkiAcmeQueueService,
  auditLogService
}: TPkiAcmeServiceFactoryDep): TPkiAcmeServiceFactory => {
  const validateAcmeProfile = async (profileId: string): Promise<TCertificateProfileWithConfigs> => {
    const profile = await certificateProfileDAL.findByIdWithConfigs(profileId);
    if (!profile) {
      throw new NotFoundError({ message: "Certificate profile not found" });
    }
    if (profile.enrollmentType !== EnrollmentType.ACME) {
      throw new NotFoundError({ message: "Certificate profile is not configured for ACME enrollment" });
    }
    return profile;
  };

  const validateJwsPayload = async <
    TSchema extends z.ZodSchema<unknown> | undefined = undefined,
    T = TSchema extends z.ZodSchema<infer R> ? R : string
  >({
    url,
    rawJwsPayload,
    getJWK,
    schema
  }: {
    url: URL;
    rawJwsPayload: TRawJwsPayload;
    getJWK: (protectedHeader: JWSHeaderParameters) => Promise<JsonWebKey>;
    schema?: TSchema;
  }): Promise<TJwsPayload<T>> => {
    let result: FlattenedVerifyResult;
    try {
      result = await flattenedVerify(rawJwsPayload, async (protectedHeader: JWSHeaderParameters | undefined) => {
        if (protectedHeader === undefined) {
          throw new AcmeMalformedError({ message: "Protected header is required" });
        }
        const jwk = await getJWK(protectedHeader);
        const key = await importJWK(jwk, protectedHeader.alg);
        return key;
      });
    } catch (error) {
      if (error instanceof AcmeError) {
        throw error;
      }
      if (error instanceof ZodError) {
        throw new AcmeMalformedError({ message: `Invalid JWS payload: ${error.message}` });
      }
      if (error instanceof errors.JWSSignatureVerificationFailed) {
        throw new AcmeBadPublicKeyError({ message: "Invalid JWS payload" });
      }
      logger.error(error, "Unexpected error while verifying JWS payload");
      throw new AcmeMalformedError({ message: "Failed to verify JWS payload" });
    }
    const { protectedHeader: rawProtectedHeader, payload: rawPayload } = result;
    try {
      const protectedHeader = ProtectedHeaderSchema.parse(rawProtectedHeader);
      if (protectedHeader.jwk && protectedHeader.kid) {
        throw new AcmeMalformedError({ message: "Both JWK and KID are provided in the protected header" });
      }
      const parsedUrl = (() => {
        try {
          return new URL(protectedHeader.url);
        } catch (error) {
          throw new AcmeMalformedError({ message: "Invalid URL in the protected header" });
        }
      })();
      // Validate the URL
      if (parsedUrl.href !== url.href) {
        throw new AcmeMalformedError({ message: "URL mismatch in the protected header" });
      }
      // Consume the nonce
      if (!protectedHeader.nonce) {
        throw new AcmeMalformedError({ message: "Nonce is required in the protected header" });
      }
      const deleted = await keyStore.deleteItem(KeyStorePrefixes.PkiAcmeNonce(protectedHeader.nonce));
      if (deleted !== 1) {
        throw new AcmeBadNonceError({ message: "Invalid nonce" });
      }

      // Parse the payload
      const decoder = new TextDecoder();
      const textPayload = decoder.decode(rawPayload);
      const payload = schema ? schema.parse(JSON.parse(textPayload)) : textPayload;
      return {
        protectedHeader,
        payload: payload as T
      };
    } catch (error) {
      if (error instanceof AcmeError) {
        throw error;
      }
      if (error instanceof ZodError) {
        throw new AcmeMalformedError({ message: `Invalid JWS payload: ${error.message}` });
      }
      logger.error(error, "Unexpected error while parsing JWS payload");
      throw new AcmeMalformedError({ message: "Failed to verify JWS payload" });
    }
  };

  const validateNewAccountJwsPayload = ({
    url,
    rawJwsPayload
  }: {
    url: URL;
    rawJwsPayload: TRawJwsPayload;
  }): Promise<TJwsPayload<TCreateAcmeAccountPayload>> => {
    return validateJwsPayload({
      url,
      rawJwsPayload,
      getJWK: async (protectedHeader) => {
        if (!protectedHeader.jwk) {
          throw new AcmeMalformedError({ message: "JWK is required in the protected header" });
        }
        return protectedHeader.jwk as unknown as JsonWebKey;
      },
      schema: CreateAcmeAccountBodySchema
    });
  };

  const validateExistingAccountJwsPayload = async <
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TSchema extends z.ZodSchema<any> | undefined = undefined,
    T = TSchema extends z.ZodSchema<infer R> ? R : string
  >({
    url,
    profileId,
    rawJwsPayload,
    schema,
    expectedAccountId
  }: {
    url: URL;
    profileId: string;
    rawJwsPayload: TRawJwsPayload;
    schema?: TSchema;
    expectedAccountId?: string;
  }): Promise<TAuthenciatedJwsPayload<T>> => {
    const profile = await validateAcmeProfile(profileId);
    const result = await validateJwsPayload({
      url,
      rawJwsPayload,
      getJWK: async (protectedHeader) => {
        // get jwk instead of kid
        if (!protectedHeader.kid) {
          throw new AcmeMalformedError({ message: "KID is required in the protected header" });
        }
        const accountId = extractAccountIdFromKid(protectedHeader.kid, profileId);
        if (expectedAccountId && accountId !== expectedAccountId) {
          throw new AcmeAccountDoesNotExistError({ message: "ACME resource not found" });
        }
        const account = await acmeAccountDAL.findByProjectIdAndAccountId(profile.id, accountId);
        if (!account) {
          throw new AcmeAccountDoesNotExistError({ message: "ACME account not found" });
        }
        if (account.alg !== protectedHeader.alg) {
          throw new AcmeMalformedError({ message: "ACME account algorithm mismatch" });
        }
        return account.publicKey as JsonWebKey;
      },
      schema
    });
    return {
      ...result,
      accountId: extractAccountIdFromKid(result.protectedHeader.kid!, profileId),
      profileId
    };
  };

  const buildAcmeOrderResource = ({
    profileId,
    order
  }: {
    order: {
      id: string;
      status: string;
      expiresAt: Date;
      notBefore?: Date | null;
      notAfter?: Date | null;
      authorizations: {
        id: string;
        identifierType: string;
        identifierValue: string;
        expiresAt: Date;
      }[];
    };
    profileId: string;
  }): TAcmeOrderResource => {
    return {
      status: order.status,
      expires: order.expiresAt.toISOString(),
      notBefore: order.notBefore?.toISOString(),
      notAfter: order.notAfter?.toISOString(),
      identifiers: order.authorizations.map((auth) => ({
        type: auth.identifierType,
        value: auth.identifierValue
      })),
      authorizations: order.authorizations.map((auth) => buildUrl(profileId, `/authorizations/${auth.id}`)),
      finalize: buildUrl(profileId, `/orders/${order.id}/finalize`),
      certificate:
        order.status === AcmeOrderStatus.Valid ? buildUrl(profileId, `/orders/${order.id}/certificate`) : undefined
    };
  };

  const checkAndSyncAcmeOrderStatus = async ({ orderId }: { orderId: string }): Promise<TPkiAcmeOrders> => {
    const order = await acmeOrderDAL.findById(orderId);
    if (!order) {
      throw new NotFoundError({ message: "ACME order not found" });
    }
    if (order.status !== AcmeOrderStatus.Processing) {
      // We only care about processing orders, as they are the ones that have async certificate requests
      return order;
    }
    return acmeOrderDAL.transaction(async (tx) => {
      // Lock the order for syncing with async cert request
      const orderWithCertificateRequest = await acmeOrderDAL.findWithCertificateRequestForSync(orderId, tx);
      if (!orderWithCertificateRequest) {
        throw new NotFoundError({ message: "ACME order not found" });
      }
      // Check the status again after we have acquired the lock, as things may have changed since we last checked
      if (
        orderWithCertificateRequest.status !== AcmeOrderStatus.Processing ||
        !orderWithCertificateRequest.certificateRequest
      ) {
        return orderWithCertificateRequest;
      }
      let newStatus: AcmeOrderStatus | undefined;
      let newCertificateId: string | undefined;
      switch (orderWithCertificateRequest.certificateRequest.status) {
        case CertificateRequestStatus.PENDING:
          break;
        case CertificateRequestStatus.ISSUED:
          newStatus = AcmeOrderStatus.Valid;
          newCertificateId = orderWithCertificateRequest.certificateRequest.certificateId ?? undefined;
          break;
        case CertificateRequestStatus.FAILED:
          newStatus = AcmeOrderStatus.Invalid;
          break;
        default:
          throw new AcmeServerInternalError({
            message: `Invalid certificate request status: ${orderWithCertificateRequest.certificateRequest.status as string}`
          });
      }
      if (newStatus) {
        return acmeOrderDAL.updateById(orderId, { status: newStatus, certificateId: newCertificateId }, tx);
      }
      return orderWithCertificateRequest;
    });
  };

  const getAcmeDirectory = async (profileId: string): Promise<TGetAcmeDirectoryResponse> => {
    const profile = await validateAcmeProfile(profileId);
    return {
      newNonce: buildUrl(profile.id, "/new-nonce"),
      newAccount: buildUrl(profile.id, "/new-account"),
      newOrder: buildUrl(profile.id, "/new-order"),
      meta: {
        externalAccountRequired: true
      }
    };
  };

  const getAcmeNewNonce = async (profileId: string): Promise<string> => {
    await validateAcmeProfile(profileId);
    const nonce = crypto.randomBytes(32).toString("base64url");
    const nonceKey = KeyStorePrefixes.PkiAcmeNonce(nonce);
    await keyStore.setItemWithExpiry(
      nonceKey,
      // Expire in 5 minutes.
      // TODO: read config from the profile to get the expiration time instead
      60 * 5,
      nonce
    );
    return nonce;
  };

  /** --------------------------------------------------------------
   * ACME Account
   * -------------------------------------------------------------- */
  const createAcmeAccount = async ({
    profileId,
    alg,
    jwk,
    payload: { onlyReturnExisting, contact, externalAccountBinding }
  }: {
    profileId: string;
    alg: string;
    jwk: JsonWebKey;
    payload: TCreateAcmeAccountPayload;
  }): Promise<TAcmeResponse<TCreateAcmeAccountResponse>> => {
    const profile = await validateAcmeProfile(profileId);
    const publicKeyThumbprint = await calculateJwkThumbprint(jwk, "sha256");

    const existingAccount: TPkiAcmeAccounts | null = await acmeAccountDAL.findByProfileIdAndPublicKeyThumbprintAndAlg(
      profileId,
      alg,
      publicKeyThumbprint
    );
    if (onlyReturnExisting) {
      if (!existingAccount) {
        throw new AcmeAccountDoesNotExistError({ message: "ACME account not found" });
      }
      return {
        status: 200,
        body: {
          status: "valid",
          contact: existingAccount.emails,
          orders: buildUrl(profile.id, `/accounts/${existingAccount.id}/orders`)
        },
        headers: {
          Location: buildUrl(profile.id, `/accounts/${existingAccount.id}`),
          Link: `<${buildUrl(profile.id, "/directory")}>;rel="index"`
        }
      };
    }

    // Note: We only check EAB for the new account request. This is a very special case for cert-manager.
    // There's a bug in their ACME client implementation, they don't take the account KID value they have
    // and relying on a '{"onlyReturnExisting": true}' new-account request to find out their KID value.
    // But the problem is, that new-account request doesn't come with EAB. And while the get existing account operation
    // fails, they just discard the error and proceed to request a new order. Since no KID provided, their ACME
    // client will send JWK instead. As a result, we are seeing KID not provide in header error for the new-order
    // endpoint.
    //
    // To solve the problem, we lose the check for EAB a bit for the onlyReturnExisting new account request.
    // It should be fine as we've already checked EAB when they created the account.
    // And the private key ownership indicating they are the same user.
    // ref: https://github.com/cert-manager/cert-manager/issues/7388#issuecomment-3535630925
    if (!externalAccountBinding) {
      throw new AcmeExternalAccountRequiredError({ message: "External account binding is required" });
    }
    if (existingAccount) {
      await auditLogService.createAuditLog({
        projectId: profile.projectId,
        actor: {
          type: ActorType.ACME_PROFILE,
          metadata: {
            profileId: profile.id
          }
        },
        event: {
          type: EventType.RETRIEVE_ACME_ACCOUNT,
          metadata: {
            accountId: existingAccount.id,
            publicKeyThumbprint
          }
        }
      });

      return {
        status: 200,
        body: {
          status: "valid",
          contact: existingAccount.emails,
          orders: buildUrl(profile.id, `/accounts/${existingAccount.id}/orders`)
        },
        headers: {
          Location: buildUrl(profile.id, `/accounts/${existingAccount.id}`),
          Link: `<${buildUrl(profile.id, "/directory")}>;rel="index"`
        }
      };
    }

    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
      projectId: profile.projectId,
      projectDAL,
      kmsService
    });
    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });
    const eabSecret = await kmsDecryptor({ cipherTextBlob: profile.acmeConfig!.encryptedEabSecret! });
    const { eabPayload, eabProtectedHeader } = await (async () => {
      try {
        const result = await flattenedVerify(externalAccountBinding, eabSecret);
        return { eabPayload: result.payload, eabProtectedHeader: result.protectedHeader };
      } catch (error) {
        if (error instanceof errors.JWSSignatureVerificationFailed) {
          throw new AcmeExternalAccountRequiredError({ message: "Invalid external account binding JWS signature" });
        }
        logger.error(error, "Unexpected error while verifying EAB JWS signature");
        throw new AcmeServerInternalError({ message: "Failed to verify EAB JWS signature" });
      }
    })();

    const { alg: eabAlg, kid: eabKid } = eabProtectedHeader!;
    if (!["HS256", "HS384", "HS512"].includes(eabAlg!)) {
      throw new AcmeExternalAccountRequiredError({
        message: "Invalid algorithm for external account binding JWS payload"
      });
    }
    // Make sure the KID in the EAB payload matches the profile ID
    if (eabKid !== profile.id) {
      throw new AcmeExternalAccountRequiredError({ message: "External account binding KID mismatch" });
    }

    // Make sure the URL matches the expected URL
    const url = eabProtectedHeader!.url!;
    if (url !== buildUrl(profile.id, "/new-account")) {
      throw new AcmeExternalAccountRequiredError({ message: "External account binding URL mismatch" });
    }

    // Make sure the JWK in the EAB payload matches the one provided in the outer JWS payload
    const decoder = new TextDecoder();
    const decodedEabPayload = decoder.decode(eabPayload);
    const eabJWK = JSON.parse(decodedEabPayload) as JsonWebKey;
    const eabPayloadJwkThumbprint = await calculateJwkThumbprint(eabJWK, "sha256");
    if (eabPayloadJwkThumbprint !== publicKeyThumbprint) {
      throw new AcmeBadPublicKeyError({
        message: "External account binding public key thumbprint or algorithm mismatch"
      });
    }

    // TODO: handle unique constraint violation error, should be very very rare
    const newAccount = await acmeAccountDAL.create({
      profileId: profile.id,
      alg,
      publicKey: jwk,
      publicKeyThumbprint,
      emails: contact ?? []
    });

    await auditLogService.createAuditLog({
      projectId: profile.projectId,
      actor: {
        type: ActorType.ACME_PROFILE,
        metadata: {
          profileId: profile.id
        }
      },
      event: {
        type: EventType.CREATE_ACME_ACCOUNT,
        metadata: {
          accountId: newAccount.id,
          publicKeyThumbprint: newAccount.publicKeyThumbprint,
          emails: newAccount.emails
        }
      }
    });

    return {
      status: 201,
      body: {
        status: "valid",
        contact: newAccount.emails,
        orders: buildUrl(profile.id, `/accounts/${newAccount.id}/orders`)
      },
      headers: {
        Location: buildUrl(profile.id, `/accounts/${newAccount.id}`),
        Link: `<${buildUrl(profile.id, "/directory")}>;rel="index"`
      }
    };
  };

  const deactivateAcmeAccount = async ({
    profileId,
    accountId
  }: {
    profileId: string;
    accountId: string;
    payload?: TDeactivateAcmeAccountPayload;
  }): Promise<TAcmeResponse<TDeactivateAcmeAccountResponse>> => {
    await validateAcmeProfile(profileId);
    // FIXME: Implement ACME account deactivation
    return {
      status: 200,
      body: {
        status: "deactivated"
      },
      headers: {
        Location: buildUrl(profileId, `/accounts/${accountId}`),
        Link: `<${buildUrl(profileId, "/directory")}>;rel="index"`
      }
    };
  };

  /** --------------------------------------------------------------
   * ACME Order
   * -------------------------------------------------------------- */
  const createAcmeOrder = async ({
    profileId,
    accountId,
    payload
  }: {
    profileId: string;
    accountId: string;
    payload: TCreateAcmeOrderPayload;
  }): Promise<TAcmeResponse<TAcmeOrderResource>> => {
    const profile = await validateAcmeProfile(profileId);
    const skipDnsOwnershipVerification = profile.acmeConfig?.skipDnsOwnershipVerification ?? false;
    // TODO: check and see if we have existing orders for this account that meet the criteria
    //       if we do, return the existing order
    // TODO: check the identifiers and see if are they even allowed for this profile.
    //       if not, we may be able to reject it early with an unsupportedIdentifier error.

    // TODO: ideally, we should return an error with subproblems if we have multiple unsupported identifiers
    if (payload.identifiers.some((identifier) => identifier.type !== AcmeIdentifierType.DNS)) {
      throw new AcmeUnsupportedIdentifierError({ message: "Only DNS identifiers are supported" });
    }
    if (
      payload.identifiers.some(
        (identifier) =>
          !validateDnsIdentifier(identifier.value) ||
          isPrivateIp(identifier.value) ||
          (!getConfig().isDevelopmentMode && identifier.value.toLowerCase() === "localhost")
      )
    ) {
      throw new AcmeUnsupportedIdentifierError({ message: "Invalid DNS identifier" });
    }

    const order = await acmeOrderDAL.transaction(async (tx) => {
      const account = (await acmeAccountDAL.findByProjectIdAndAccountId(profileId, accountId))!;
      const createdOrder = await acmeOrderDAL.create(
        {
          accountId: account.id,
          status: skipDnsOwnershipVerification ? AcmeOrderStatus.Ready : AcmeOrderStatus.Pending,
          notBefore: payload.notBefore ? new Date(payload.notBefore) : undefined,
          notAfter: payload.notAfter ? new Date(payload.notAfter) : undefined,
          // TODO: read config from the profile to get the expiration time instead
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        },
        tx
      );
      const authorizations: TPkiAcmeAuths[] = await Promise.all(
        payload.identifiers.map(async (identifier) => {
          if (identifier.type !== AcmeIdentifierType.DNS) {
            throw new AcmeUnsupportedIdentifierError({ message: "Only DNS identifiers are supported" });
          }
          if (isPrivateIp(identifier.value)) {
            throw new AcmeUnsupportedIdentifierError({ message: "Private IP addresses are not allowed" });
          }
          const auth = await acmeAuthDAL.create(
            {
              accountId: account.id,
              status: skipDnsOwnershipVerification ? AcmeAuthStatus.Valid : AcmeAuthStatus.Pending,
              identifierType: identifier.type,
              identifierValue: identifier.value,
              // RFC 8555 suggests a token with at least 128 bits of entropy
              // We are using 256 bits of entropy here, should be enough for now
              // ref: https://datatracker.ietf.org/doc/html/rfc8555#section-11.3
              token: crypto.randomBytes(32).toString("base64url"),
              // TODO: read config from the profile to get the expiration time instead
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            },
            tx
          );
          if (!skipDnsOwnershipVerification) {
            for (const challengeType of [AcmeChallengeType.HTTP_01, AcmeChallengeType.DNS_01]) {
              // eslint-disable-next-line no-await-in-loop
              await acmeChallengeDAL.create(
                {
                  authId: auth.id,
                  status: AcmeChallengeStatus.Pending,
                  type: challengeType
                },
                tx
              );
            }
          }
          return auth;
        })
      );

      await acmeOrderAuthDAL.insertMany(
        authorizations.map((auth) => ({
          orderId: createdOrder.id,
          authId: auth.id
        })),
        tx
      );
      await auditLogService.createAuditLog({
        projectId: profile.projectId,
        actor: {
          type: ActorType.ACME_ACCOUNT,
          metadata: {
            profileId: account.profileId,
            accountId: account.id
          }
        },
        event: {
          type: EventType.CREATE_ACME_ORDER,
          metadata: {
            orderId: createdOrder.id,
            identifiers: authorizations.map((auth) => ({
              type: auth.identifierType as AcmeIdentifierType,
              value: auth.identifierValue
            }))
          }
        }
      });
      return { ...createdOrder, authorizations, account };
    });

    return {
      status: 201,
      body: buildAcmeOrderResource({
        profileId,
        order
      }),
      headers: {
        Location: buildUrl(profileId, `/orders/${order.id}`),
        Link: `<${buildUrl(profileId, "/directory")}>;rel="index"`
      }
    };
  };

  const getAcmeOrder = async ({
    profileId,
    accountId,
    orderId
  }: {
    profileId: string;
    accountId: string;
    orderId: string;
  }): Promise<TAcmeResponse<TAcmeOrderResource>> => {
    const order = await acmeOrderDAL.findByAccountAndOrderIdWithAuthorizations(accountId, orderId);
    if (!order) {
      throw new NotFoundError({ message: "ACME order not found" });
    }
    // Sync order first in case if there is a certificate request that needs to be processed
    await checkAndSyncAcmeOrderStatus({ orderId });
    const updatedOrder = (await acmeOrderDAL.findByAccountAndOrderIdWithAuthorizations(accountId, orderId))!;
    return {
      status: 200,
      body: buildAcmeOrderResource({ profileId, order: updatedOrder }),
      headers: {
        Location: buildUrl(profileId, `/orders/${orderId}`),
        Link: `<${buildUrl(profileId, "/directory")}>;rel="index"`
      }
    };
  };

  const processCertificateIssuanceForOrder = async ({
    caType,
    accountId,
    actorOrgId,
    profileId,
    orderId,
    csr,
    finalizingOrder,
    certificateRequest,
    profile,
    ca,
    tx
  }: {
    caType: CaType;
    accountId: string;
    actorOrgId: string;
    profileId: string;
    orderId: string;
    csr: string;
    finalizingOrder: {
      notBefore?: Date | null;
      notAfter?: Date | null;
    };
    certificateRequest: ReturnType<typeof extractCertificateRequestFromCSR>;
    profile: TCertificateProfileWithConfigs;
    ca: Awaited<ReturnType<typeof certificateAuthorityDAL.findByIdWithAssociatedCa>>;
    tx?: Knex;
  }): Promise<{ certificateId?: string; certIssuanceJobData?: TIssueCertificateFromProfileJobData }> => {
    if (caType === CaType.INTERNAL) {
      const result = await certificateV3Service.signCertificateFromProfile({
        actor: ActorType.ACME_ACCOUNT,
        actorId: accountId,
        actorAuthMethod: null,
        actorOrgId,
        profileId,
        csr,
        notBefore: finalizingOrder.notBefore ? new Date(finalizingOrder.notBefore) : undefined,
        notAfter: finalizingOrder.notAfter ? new Date(finalizingOrder.notAfter) : undefined,
        validity: !finalizingOrder.notAfter
          ? {
              ttl: profile.defaultTtlDays ? `${profile.defaultTtlDays}d` : "47d"
            }
          : // ttl is not used if notAfter is provided
            ({ ttl: "0d" } as const),
        enrollmentType: EnrollmentType.ACME
      });
      return {
        certificateId: result.certificateId
      };
    }

    const { keyAlgorithm: extractedKeyAlgorithm, signatureAlgorithm: extractedSignatureAlgorithm } =
      extractAlgorithmsFromCSR(csr);
    const updatedCertificateRequest = {
      ...certificateRequest,
      keyAlgorithm: extractedKeyAlgorithm,
      signatureAlgorithm: extractedSignatureAlgorithm,
      validity: finalizingOrder.notAfter
        ? (() => {
            const notBefore = finalizingOrder.notBefore ? new Date(finalizingOrder.notBefore) : new Date();
            const notAfter = new Date(finalizingOrder.notAfter);
            const diffMs = notAfter.getTime() - notBefore.getTime();
            const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
            return { ttl: `${diffDays}d` };
          })()
        : certificateRequest.validity
    };

    const policy = await certificatePolicyDAL.findById(profile.certificatePolicyId);
    if (!policy) {
      throw new NotFoundError({ message: "Certificate policy not found" });
    }
    const validationResult = await certificatePolicyService.validateCertificateRequest(
      policy.id,
      updatedCertificateRequest
    );
    if (!validationResult.isValid) {
      throw new AcmeBadCSRError({ message: `Invalid CSR: ${validationResult.errors.join(", ")}` });
    }

    const certRequest = await certificateRequestService.createCertificateRequest({
      actor: ActorType.ACME_ACCOUNT,
      actorId: accountId,
      actorAuthMethod: null,
      actorOrgId,
      projectId: profile.projectId,
      caId: ca.id,
      profileId: profile.id,
      commonName: updatedCertificateRequest.commonName ?? "",
      keyUsages: updatedCertificateRequest.keyUsages?.map((usage) => usage.toString()) ?? [],
      extendedKeyUsages: updatedCertificateRequest.extendedKeyUsages?.map((usage) => usage.toString()) ?? [],
      keyAlgorithm: updatedCertificateRequest.keyAlgorithm || "",
      signatureAlgorithm: updatedCertificateRequest.signatureAlgorithm || "",
      altNames: updatedCertificateRequest.subjectAlternativeNames?.map((san) => san.value).join(","),
      notBefore: updatedCertificateRequest.notBefore,
      notAfter: updatedCertificateRequest.notAfter,
      status: CertificateRequestStatus.PENDING,
      acmeOrderId: orderId,
      csr,
      tx
    });
    const csrObj = new x509.Pkcs10CertificateRequest(csr);
    const csrPem = csrObj.toString("pem");
    return {
      certIssuanceJobData: {
        certificateId: orderId,
        profileId: profile.id,
        caId: profile.caId || "",
        ttl: updatedCertificateRequest.validity?.ttl || "1y",
        signatureAlgorithm: updatedCertificateRequest.signatureAlgorithm || "",
        keyAlgorithm: updatedCertificateRequest.keyAlgorithm || "",
        commonName: updatedCertificateRequest.commonName || "",
        altNames: updatedCertificateRequest.subjectAlternativeNames?.map((san) => san.value) || [],
        keyUsages: updatedCertificateRequest.keyUsages?.map((usage) => usage.toString()) ?? [],
        extendedKeyUsages: updatedCertificateRequest.extendedKeyUsages?.map((usage) => usage.toString()) ?? [],
        certificateRequestId: certRequest.id,
        csr: csrPem
      }
    };
  };

  const finalizeAcmeOrder = async ({
    profileId,
    accountId,
    orderId,
    payload
  }: {
    profileId: string;
    accountId: string;
    orderId: string;
    payload: TFinalizeAcmeOrderPayload;
  }): Promise<TAcmeResponse<TAcmeOrderResource>> => {
    const profile = (await certificateProfileDAL.findByIdWithConfigs(profileId))!;

    if (!profile.caId) {
      throw new BadRequestError({
        message: "Self-signed certificates are not supported for ACME enrollment"
      });
    }

    let order = await acmeOrderDAL.findByAccountAndOrderIdWithAuthorizations(accountId, orderId);
    if (!order) {
      throw new NotFoundError({ message: "ACME order not found" });
    }
    if (order.status === AcmeOrderStatus.Ready) {
      const {
        order: updatedOrder,
        error,
        certIssuanceJobData
      } = await acmeOrderDAL.transaction(async (tx) => {
        const finalizingOrder = (await acmeOrderDAL.findByIdForFinalization(orderId, tx))!;
        // TODO: ideally, this should be doen with onRequest: verifyAuth([AuthMode.ACME_JWS_SIGNATURE]), instead?
        const { ownerOrgId: actorOrgId } = (await certificateProfileDAL.findByIdWithOwnerOrgId(profileId, tx))!;
        if (finalizingOrder.status !== AcmeOrderStatus.Ready) {
          throw new AcmeOrderNotReadyError({ message: "ACME order is not ready" });
        }
        if (finalizingOrder.expiresAt < new Date()) {
          throw new AcmeOrderNotReadyError({ message: "ACME order has expired" });
        }

        const { csr } = payload;

        // Check and validate the CSR
        const certificateRequest = extractCertificateRequestFromCSR(csr);
        if (
          certificateRequest.subjectAlternativeNames?.some(
            (san) => san.type !== CertSubjectAlternativeNameType.DNS_NAME
          )
        ) {
          throw new AcmeBadCSRError({ message: "Invalid CSR: Only DNS subject alternative names are supported" });
        }
        const orderWithAuthorizations = (await acmeOrderDAL.findByAccountAndOrderIdWithAuthorizations(
          accountId,
          orderId,
          tx
        ))!;
        const csrIdentifierValues = new Set(
          (certificateRequest.subjectAlternativeNames ?? [])
            .map((san) => san.value.toLowerCase())
            .concat(certificateRequest.commonName ? [certificateRequest.commonName.toLowerCase()] : [])
        );
        if (
          csrIdentifierValues.size !== orderWithAuthorizations.authorizations.length ||
          !orderWithAuthorizations.authorizations.every((auth) =>
            csrIdentifierValues.has(auth.identifierValue.toLowerCase())
          )
        ) {
          throw new AcmeBadCSRError({ message: "Invalid CSR: Common name + SANs mismatch with order identifiers" });
        }

        const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(profile.caId!);
        if (!ca) {
          throw new NotFoundError({ message: "Certificate Authority not found" });
        }
        const caType = (ca.externalCa?.type as CaType) ?? CaType.INTERNAL;
        let errorToReturn: Error | undefined;
        let certIssuanceJobDataToReturn: TIssueCertificateFromProfileJobData | undefined;
        try {
          const result = await processCertificateIssuanceForOrder({
            caType,
            accountId,
            actorOrgId,
            profileId,
            orderId,
            csr,
            finalizingOrder,
            certificateRequest,
            profile,
            ca,
            tx
          });
          await acmeOrderDAL.updateById(
            orderId,
            {
              status: result.certificateId ? AcmeOrderStatus.Valid : AcmeOrderStatus.Processing,
              csr,
              certificateId: result.certificateId
            },
            tx
          );
          certIssuanceJobDataToReturn = result.certIssuanceJobData;
        } catch (exp) {
          await acmeOrderDAL.updateById(
            orderId,
            {
              csr,
              status: AcmeOrderStatus.Invalid,
              error: exp instanceof Error ? exp.message : "Unknown error"
            },
            tx
          );
          logger.error(exp, "Failed to sign certificate");
          // TODO: audit log the error
          if (exp instanceof BadRequestError) {
            errorToReturn = new AcmeBadCSRError({ message: `Invalid CSR: ${exp.message}` });
          } else if (exp instanceof AcmeError) {
            errorToReturn = exp;
          } else {
            errorToReturn = new AcmeServerInternalError({
              message: "Failed to sign certificate with internal error"
            });
          }
        }
        return {
          order: (await acmeOrderDAL.findByAccountAndOrderIdWithAuthorizations(accountId, orderId, tx))!,
          error: errorToReturn,
          certIssuanceJobData: certIssuanceJobDataToReturn
        };
      });
      if (error) {
        throw error;
      }
      if (certIssuanceJobData) {
        // TODO: ideally, this should be done inside the transaction, but the pg-boss queue doesn't support external transactions
        //       as it seems to be. we need to commit the transaction before queuing the job, otherwise the job will fail (not found error).
        await certificateIssuanceQueue.queueCertificateIssuance(certIssuanceJobData);
      }
      order = updatedOrder;
      await auditLogService.createAuditLog({
        projectId: profile.projectId,
        actor: {
          type: ActorType.ACME_ACCOUNT,
          metadata: {
            profileId,
            accountId
          }
        },
        event: {
          type: EventType.FINALIZE_ACME_ORDER,
          metadata: {
            orderId: updatedOrder.id,
            csr: updatedOrder.csr!
          }
        }
      });
    } else if (order.status !== AcmeOrderStatus.Valid) {
      throw new AcmeOrderNotReadyError({ message: "ACME order is not ready" });
    }
    return {
      status: 200,
      body: buildAcmeOrderResource({ profileId, order }),
      headers: {
        Location: buildUrl(profileId, `/orders/${orderId}`),
        Link: `<${buildUrl(profileId, "/directory")}>;rel="index"`
      }
    };
  };

  const downloadAcmeCertificate = async ({
    profileId,
    accountId,
    orderId
  }: {
    profileId: string;
    accountId: string;
    orderId: string;
  }): Promise<TAcmeResponse<string>> => {
    const profile = await validateAcmeProfile(profileId);
    const order = await acmeOrderDAL.findByAccountAndOrderIdWithAuthorizations(accountId, orderId);
    if (!order) {
      throw new NotFoundError({ message: "ACME order not found" });
    }
    // Sync order first in case if there is a certificate request that needs to be processed
    const syncedOrder = await checkAndSyncAcmeOrderStatus({ orderId });
    if (syncedOrder.status !== AcmeOrderStatus.Valid) {
      throw new AcmeOrderNotReadyError({ message: "ACME order is not valid" });
    }
    if (!syncedOrder.certificateId) {
      throw new NotFoundError({ message: "The certificate for this ACME order no longer exists" });
    }

    const certBody = await certificateBodyDAL.findOne({ certId: syncedOrder.certificateId });
    const certificateManagerKeyId = await getProjectKmsCertificateKeyId({
      projectId: profile.projectId,
      projectDAL,
      kmsService
    });

    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: certificateManagerKeyId
    });
    const decryptedCert = await kmsDecryptor({
      cipherTextBlob: certBody.encryptedCertificate
    });
    const certObj = new x509.X509Certificate(decryptedCert);
    const decryptedCertChain = await kmsDecryptor({
      cipherTextBlob: certBody.encryptedCertificateChain!
    });
    const certificateChain = decryptedCertChain.toString();

    const certLeaf = certObj.toString("pem").trim().replace("\n", "\r\n");
    const certChain = certificateChain.trim().replace("\n", "\r\n");

    await auditLogService.createAuditLog({
      projectId: profile.projectId,
      actor: {
        type: ActorType.ACME_ACCOUNT,
        metadata: {
          profileId,
          accountId
        }
      },
      event: {
        type: EventType.DOWNLOAD_ACME_CERTIFICATE,
        metadata: {
          orderId
        }
      }
    });

    return {
      status: 200,
      body:
        // The final line is needed, otherwise some clients will not parse the certificate chain correctly
        // ref: https://github.com/certbot/certbot/blob/4d5d5f7ae8164884c841969e46caed8db1ad34af/certbot/src/certbot/crypto_util.py#L506-L514
        `${certLeaf}\r\n${certChain}\r\n`,
      headers: {
        Location: buildUrl(profileId, `/orders/${orderId}/certificate`),
        Link: `<${buildUrl(profileId, "/directory")}>;rel="index"`
      }
    };
  };

  const listAcmeOrders = async ({
    profileId,
    accountId
  }: {
    profileId: string;
    accountId: string;
  }): Promise<TAcmeResponse<TListAcmeOrdersResponse>> => {
    const orders = await acmeOrderDAL.listByAccountId(accountId);
    return {
      status: 200,
      body: { orders: orders.map((order) => buildUrl(profileId, `/orders/${order.id}`)) },
      headers: {
        Link: `<${buildUrl(profileId, "/directory")}>;rel="index"`
      }
    };
  };

  /** --------------------------------------------------------------
   * ACME Authorization
   * -------------------------------------------------------------- */
  const getAcmeAuthorization = async ({
    profileId,
    accountId,
    authzId
  }: {
    profileId: string;
    accountId: string;
    authzId: string;
  }): Promise<TAcmeResponse<TGetAcmeAuthorizationResponse>> => {
    const auth = await acmeAuthDAL.findByAccountIdAndAuthIdWithChallenges(accountId, authzId);
    if (!auth) {
      throw new NotFoundError({ message: "ACME authorization not found" });
    }
    return {
      status: 200,
      body: {
        status: auth.status,
        expires: auth.expiresAt.toISOString(),
        identifier: {
          type: auth.identifierType,
          value: auth.identifierValue
        },
        challenges: auth.challenges.map((challenge) => {
          return {
            type: challenge.type,
            url: buildUrl(profileId, `/authorizations/${authzId}/challenges/${challenge.id}`),
            status: challenge.status,
            token: auth.token!
          };
        })
      },
      headers: {
        Location: buildUrl(profileId, `/authorizations/${authzId}`),
        Link: `<${buildUrl(profileId, "/directory")}>;rel="index"`
      }
    };
  };

  const respondToAcmeChallenge = async ({
    profileId,
    accountId,
    authzId,
    challengeId
  }: {
    profileId: string;
    accountId: string;
    authzId: string;
    challengeId: string;
  }): Promise<TAcmeResponse<TRespondToAcmeChallengeResponse>> => {
    const profile = await validateAcmeProfile(profileId);
    const result = await acmeChallengeDAL.findByAccountAuthAndChallengeId(accountId, authzId, challengeId);
    if (!result) {
      throw new NotFoundError({ message: "ACME challenge not found" });
    }
    await acmeChallengeService.markChallengeAsReady(challengeId);
    await pkiAcmeQueueService.queueChallengeValidation(challengeId);
    const challenge = (await acmeChallengeDAL.findByIdForChallengeValidation(challengeId))!;
    await auditLogService.createAuditLog({
      projectId: profile.projectId,
      actor: {
        type: ActorType.ACME_ACCOUNT,
        metadata: {
          profileId,
          accountId
        }
      },
      event: {
        type: EventType.RESPOND_TO_ACME_CHALLENGE,
        metadata: {
          challengeId,
          type: challenge.type as AcmeChallengeType
        }
      }
    });
    return {
      status: 200,
      body: {
        type: challenge.type,
        url: buildUrl(profileId, `/authorizations/${authzId}/challenges/${challengeId}`),
        status: challenge.status,
        token: challenge.auth.token!
      },
      headers: {
        Location: buildUrl(profileId, `/authorizations/${authzId}/challenges/${challengeId}`),
        Link: [
          `<${buildUrl(profileId, `/authorizations/${authzId}`)}>;rel="up"`,
          `<${buildUrl(profileId, "/directory")}>;rel="index"`
        ]
      }
    };
  };

  return {
    validateJwsPayload,
    validateNewAccountJwsPayload,
    validateExistingAccountJwsPayload,
    getAcmeDirectory,
    getAcmeNewNonce,
    createAcmeAccount,
    createAcmeOrder,
    deactivateAcmeAccount,
    listAcmeOrders,
    getAcmeOrder,
    finalizeAcmeOrder,
    downloadAcmeCertificate,
    getAcmeAuthorization,
    respondToAcmeChallenge
  };
};
