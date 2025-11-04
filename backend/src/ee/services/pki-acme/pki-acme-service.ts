import { TPkiAcmeAccounts } from "@app/db/schemas/pki-acme-accounts";
import { TPkiAcmeAuths } from "@app/db/schemas/pki-acme-auths";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TCertificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";

import { ActorType } from "@app/services/auth/auth-type";
import {
  EnrollmentType,
  TCertificateProfileWithConfigs
} from "@app/services/certificate-profile/certificate-profile-types";
import { TCertificateV3ServiceFactory } from "@app/services/certificate-v3/certificate-v3-service";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";
import {
  calculateJwkThumbprint,
  errors,
  flattenedVerify,
  FlattenedVerifyResult,
  importJWK,
  JWSHeaderParameters
} from "jose";
import { z, ZodError } from "zod";
import { TPkiAcmeAccountDALFactory } from "./pki-acme-account-dal";
import { TPkiAcmeAuthDALFactory } from "./pki-acme-auth-dal";
import { TPkiAcmeChallengeDALFactory } from "./pki-acme-challenge-dal";
import {
  AcmeAccountDoesNotExistError,
  AcmeBadCSRError,
  AcmeBadPublicKeyError,
  AcmeError,
  AcmeExternalAccountRequiredError,
  AcmeMalformedError,
  AcmeOrderNotReadyError,
  AcmeServerInternalError,
  AcmeUnauthorizedError,
  AcmeUnsupportedIdentifierError
} from "./pki-acme-errors";
import { TPkiAcmeOrderAuthDALFactory } from "./pki-acme-order-auth-dal";
import { TPkiAcmeOrderDALFactory } from "./pki-acme-order-dal";
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
  projectDAL: Pick<TProjectDALFactory, "findOne" | "updateById" | "transaction">;
  certificateProfileDAL: Pick<TCertificateProfileDALFactory, "findByIdWithOwnerOrgId" | "findByIdWithConfigs">;
  acmeAccountDAL: Pick<
    TPkiAcmeAccountDALFactory,
    "findByProjectIdAndAccountId" | "findByProfileIdAndPublicKeyThumbprintAndAlg" | "create"
  >;
  acmeOrderDAL: Pick<
    TPkiAcmeOrderDALFactory,
    "create" | "transaction" | "updateById" | "findByAccountAndOrderIdWithAuthorizations" | "findByIdForFinalization"
  >;
  acmeAuthDAL: Pick<TPkiAcmeAuthDALFactory, "create" | "findByAccountIdAndAuthIdWithChallenges">;
  acmeOrderAuthDAL: Pick<TPkiAcmeOrderAuthDALFactory, "insertMany">;
  acmeChallengeDAL: Pick<
    TPkiAcmeChallengeDALFactory,
    "create" | "transaction" | "updateById" | "findByAccountAuthAndChallengeId" | "findByIdForChallengeValidation"
  >;
  kmsService: Pick<TKmsServiceFactory, "decryptWithKmsKey" | "generateKmsKey">;
  certificateV3Service: Pick<TCertificateV3ServiceFactory, "signCertificateFromProfile">;
  acmeChallengeService: TPkiAcmeChallengeServiceFactory;
};

export const pkiAcmeServiceFactory = ({
  projectDAL,
  certificateProfileDAL,
  acmeAccountDAL,
  acmeOrderDAL,
  acmeAuthDAL,
  acmeOrderAuthDAL,
  acmeChallengeDAL,
  kmsService,
  certificateV3Service,
  acmeChallengeService
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

  const buildUrl = (profileId: string, path: string): string => {
    const appCfg = getConfig();
    const baseUrl = appCfg.SITE_URL ?? "";
    return `${baseUrl}/api/v1/pki/acme/profiles/${profileId}${path}`;
  };

  const extractAccountIdFromKid = (kid: string, profileId: string): string => {
    const kidPrefix = buildUrl(profileId, "/accounts/");
    if (!kid.startsWith(kidPrefix)) {
      throw new AcmeMalformedError({ detail: "KID must start with the profile account URL" });
    }
    return z.string().uuid().parse(kid.slice(kidPrefix.length));
  };

  const validateJwsPayload = async <
    TSchema extends z.ZodSchema<any> | undefined = undefined,
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
          throw new AcmeMalformedError({ detail: "Protected header is required" });
        }
        const jwk = await getJWK(protectedHeader);
        return await importJWK(jwk, protectedHeader.alg);
      });
    } catch (error) {
      if (error instanceof AcmeError) {
        throw error;
      }
      if (error instanceof ZodError) {
        throw new AcmeMalformedError({ detail: `Invalid JWS payload: ${error.message}` });
      }
      if (error instanceof errors.JWSInvalid) {
        throw new AcmeBadPublicKeyError({ detail: "Invalid JWS payload" });
      }
      logger.error(error, "Unexpected error while verifying JWS payload");
      throw new AcmeServerInternalError({ detail: "Failed to verify JWS payload" });
    }
    const { protectedHeader: rawProtectedHeader, payload: rawPayload } = result;
    try {
      const protectedHeader = ProtectedHeaderSchema.parse(rawProtectedHeader);
      if (new URL(protectedHeader.url).href !== url.href) {
        throw new AcmeUnauthorizedError({ detail: "URL mismatch in the protected header" });
      }
      // TODO: consume the nonce here
      const decoder = new TextDecoder();
      const textPayload = decoder.decode(rawPayload);
      const payload = schema ? schema.parse(JSON.parse(textPayload)) : textPayload;
      return {
        protectedHeader,
        payload
      };
    } catch (error) {
      if (error instanceof AcmeError) {
        throw error;
      }
      if (error instanceof ZodError) {
        throw new AcmeMalformedError({ detail: `Invalid JWS payload: ${error.message}` });
      }
      logger.error(error, "Unexpected error while parsing JWS payload");
      throw new AcmeServerInternalError({ detail: "Failed to verify JWS payload" });
    }
  };

  const validateNewAccountJwsPayload = async ({
    url,
    rawJwsPayload
  }: {
    url: URL;
    rawJwsPayload: TRawJwsPayload;
  }): Promise<TJwsPayload<TCreateAcmeAccountPayload>> => {
    return await validateJwsPayload({
      url,
      rawJwsPayload,
      getJWK: async (protectedHeader) => {
        if (!protectedHeader.jwk) {
          throw new AcmeMalformedError({ detail: "JWK is required in the protected header" });
        }
        return protectedHeader.jwk as unknown as JsonWebKey;
      },
      schema: CreateAcmeAccountBodySchema
    });
  };

  const validateExistingAccountJwsPayload = async <
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
        if (!protectedHeader.kid) {
          throw new AcmeMalformedError({ detail: "KID is required in the protected header" });
        }
        const accountId = extractAccountIdFromKid(protectedHeader.kid, profileId);
        if (expectedAccountId && accountId !== expectedAccountId) {
          throw new NotFoundError({ message: "ACME resource not found" });
        }
        const account = await acmeAccountDAL.findByProjectIdAndAccountId(profile.id, accountId);
        if (!account) {
          throw new AcmeAccountDoesNotExistError({ message: "ACME account not found" });
        }
        if (account.alg !== protectedHeader.alg) {
          throw new AcmeMalformedError({ detail: "ACME account algorithm mismatch" });
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
      authorizations: TPkiAcmeAuths[];
    };
    profileId: string;
  }): TAcmeOrderResource => {
    return {
      status: order.status,
      expires: order.expiresAt.toISOString(),
      notBefore: order.notBefore?.toISOString(),
      notAfter: order.notAfter?.toISOString(),
      identifiers: order.authorizations.map((auth: TPkiAcmeAuths) => ({
        type: auth.identifierType,
        value: auth.identifierValue
      })),
      authorizations: order.authorizations.map((auth: TPkiAcmeAuths) =>
        buildUrl(profileId, `/authorizations/${auth.id}`)
      ),
      finalize: buildUrl(profileId, `/orders/${order.id}/finalize`),
      certificate:
        order.status === AcmeOrderStatus.Valid ? buildUrl(profileId, `/orders/${order.id}/certificate`) : undefined
    };
  };

  const getAcmeDirectory = async (profileId: string): Promise<TGetAcmeDirectoryResponse> => {
    const profile = await validateAcmeProfile(profileId);
    return {
      newNonce: buildUrl(profile.id, "/new-nonce"),
      newAccount: buildUrl(profile.id, "/new-account"),
      newOrder: buildUrl(profile.id, "/new-order")
    };
  };

  const getAcmeNewNonce = async (profileId: string): Promise<string> => {
    const profile = await validateAcmeProfile(profileId);
    // FIXME: Implement ACME new nonce generation
    // Generate a new nonce, store it, and return it
    return "FIXME-generate-nonce";
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
    if (!externalAccountBinding) {
      throw new AcmeExternalAccountRequiredError({ detail: "External account binding is required" });
    }

    const publicKeyThumbprint = await calculateJwkThumbprint(jwk, "sha256");
    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
      projectId: profile.projectId,
      projectDAL,
      kmsService
    });
    const kmsDecryptor = await kmsService.decryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });
    const eabSecret = await kmsDecryptor({ cipherTextBlob: profile.acmeConfig!.encryptedEabSecret });
    try {
      const { payload: eabPayload, protectedHeader: eabProtectedHeader } = await flattenedVerify(
        externalAccountBinding,
        eabSecret
      );
      const eabAlg = eabProtectedHeader!.alg!;
      if (!["HS256", "HS384", "HS512"].includes(eabAlg)) {
        throw new AcmeMalformedError({ detail: "Invalid algorithm for external account binding JWS payload" });
      }
      // Make sure the URL matches the expected URL
      const url = eabProtectedHeader!.url!;
      if (url !== buildUrl(profile.id, "/new-account")) {
        throw new UnauthorizedError({ message: "External account binding URL mismatch" });
      }

      // Make sure the JWK in the EAB payload matches the one provided in the outer JWS payload
      const decoder = new TextDecoder();
      const decodedEabPayload = decoder.decode(eabPayload);
      const eabPayloadJson = JSON.parse(decodedEabPayload);
      const eabPayloadJwkThumbprint = await calculateJwkThumbprint(
        eabPayloadJson.jwk as JsonWebKey,
        alg as "sha256" | "sha384" | "sha512"
      );
      if (eabPayloadJwkThumbprint !== publicKeyThumbprint || eabAlg !== alg) {
        throw new AcmeBadPublicKeyError({
          message: "External account binding public key thumbprint or algorithm mismatch"
        });
      }
      // Make sure the KID in the EAB payload matches the profile ID
      if ((eabPayload as unknown as { kid: string }).kid !== profile.id) {
        throw new UnauthorizedError({ message: "External account binding KID mismatch" });
      }
    } catch (error) {
      if (error instanceof errors.JWSInvalid) {
        throw new AcmeMalformedError({ detail: "Invalid external account binding JWS payload" });
      }
      if (error instanceof AcmeError) {
        throw error;
      }
      logger.error(error, "Unexpected error while verifying EAB JWS payload");
      throw new AcmeServerInternalError({ detail: "Failed to verify EAB JWS payload" });
    }

    const existingAccount: TPkiAcmeAccounts | null = await acmeAccountDAL.findByProfileIdAndPublicKeyThumbprintAndAlg(
      profileId,
      alg,
      publicKeyThumbprint
    );
    if (onlyReturnExisting && !existingAccount) {
      throw new AcmeAccountDoesNotExistError({ message: "ACME account not found" });
    }
    if (existingAccount) {
      // With the same public key, we found an existing account, just return it
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

    const newAccount = await acmeAccountDAL.create({
      profileId: profile.id,
      alg,
      publicKey: jwk,
      publicKeyThumbprint,
      emails: contact ?? []
    });
    // TODO: create audit log here
    // TODO: check EAB authentication here
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
    accountId,
    payload: { status } = { status: "deactivated" }
  }: {
    profileId: string;
    accountId: string;
    payload?: TDeactivateAcmeAccountPayload;
  }): Promise<TAcmeResponse<TDeactivateAcmeAccountResponse>> => {
    const profile = await validateAcmeProfile(profileId);
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
    // TODO: check and see if we have existing orders for this account that meet the criteria
    //       if we do, return the existing order

    const order = await acmeOrderDAL.transaction(async (tx) => {
      const account = (await acmeAccountDAL.findByProjectIdAndAccountId(profileId, accountId))!;
      const createdOrder = await acmeOrderDAL.create(
        {
          accountId: account.id,
          status: AcmeOrderStatus.Pending,
          notBefore: payload.notBefore ? new Date(payload.notBefore) : undefined,
          notAfter: payload.notAfter ? new Date(payload.notAfter) : undefined,
          // TODO: read config from the profile to get the expiration time instead
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        },
        tx
      );
      const authorizations: TPkiAcmeAuths[] = await Promise.all(
        payload.identifiers.map(async (identifier) => {
          if (identifier.type === AcmeIdentifierType.DNS) {
            // TODO: reuse existing authorizations for this identifier if they exist
            const auth = await acmeAuthDAL.create(
              {
                accountId: account.id,
                status: AcmeAuthStatus.Pending,
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
            // TODO: support other challenge types here. Currently only HTTP-01 is supported.
            await acmeChallengeDAL.create(
              {
                authId: auth.id,
                status: AcmeChallengeStatus.Pending,
                type: AcmeChallengeType.HTTP_01
              },
              tx
            );
            return auth;
          } else {
            throw new AcmeUnsupportedIdentifierError({ detail: "Only DNS identifiers are supported" });
          }
        })
      );

      await acmeOrderAuthDAL.insertMany(
        authorizations.map((auth) => ({
          orderId: createdOrder.id,
          authId: auth.id
        })),
        tx
      );
      // TODO: create audit log here
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
    return {
      status: 200,
      body: buildAcmeOrderResource({ profileId, order }),
      headers: {
        Location: buildUrl(profileId, `/orders/${orderId}`),
        Link: `<${buildUrl(profileId, "/directory")}>;rel="index"`
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
    let order = await acmeOrderDAL.findByAccountAndOrderIdWithAuthorizations(accountId, orderId);
    if (!order) {
      throw new NotFoundError({ message: "ACME order not found" });
    }
    if (order.status === AcmeOrderStatus.Ready) {
      const { order: updatedOrder, error } = await acmeOrderDAL.transaction(async (tx) => {
        const order = (await acmeOrderDAL.findByIdForFinalization(orderId, tx))!;
        // TODO: ideally, this should be doen with onRequest: verifyAuth([AuthMode.ACME_JWS_SIGNATURE]), instead
        const { ownerOrgId: actorOrgId } = (await certificateProfileDAL.findByIdWithOwnerOrgId(profileId, tx))!;
        if (order.status !== AcmeOrderStatus.Ready) {
          throw new AcmeOrderNotReadyError({ message: "ACME order is not ready" });
        }
        if (order.expiresAt < new Date()) {
          throw new AcmeOrderNotReadyError({ message: "ACME order has expired" });
        }
        const { csr } = payload;
        // TODO: validate the CSR and return badCSR error if it's invalid
        // TODO: this should be the same transaction?
        let errorToReturn: Error | undefined;
        try {
          const { certificate, certificateChain, certificateId } =
            await certificateV3Service.signCertificateFromProfile({
              actor: ActorType.ACME_ACCOUNT,
              actorId: accountId,
              actorAuthMethod: null,
              actorOrgId,
              profileId,
              csr,
              notBefore: order.notBefore ? new Date(order.notBefore) : undefined,
              notAfter: order.notAfter ? new Date(order.notAfter) : undefined,
              validity: {
                // TODO: read config from the profile to get the expiration time instead
                ttl: (24 * 60 * 60 * 1000).toString()
              },
              enrollmentType: EnrollmentType.ACME
            });
          // TODO: associate the certificate with the order
          await acmeOrderDAL.updateById(
            orderId,
            {
              status: AcmeOrderStatus.Valid,
              csr,
              certificateChain,
              certificate
            },
            tx
          );
        } catch (error) {
          await acmeOrderDAL.updateById(
            orderId,
            {
              csr,
              status: AcmeOrderStatus.Invalid,
              error: error instanceof Error ? error.message : "Unknown error"
            },
            tx
          );
          // TODO: log the error
          // TODO: audit log the error
          if (error instanceof BadRequestError) {
            errorToReturn = new AcmeBadCSRError({ detail: `Invalid CSR: ${error.message}` });
          } else {
            errorToReturn = new AcmeServerInternalError({ detail: "Failed to sign certificate with internal error" });
          }
        }
        return {
          order: (await acmeOrderDAL.findByAccountAndOrderIdWithAuthorizations(accountId, orderId, tx))!,
          error: errorToReturn
        };
      });
      if (error) {
        throw error;
      }
      order = updatedOrder;
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
    const order = await acmeOrderDAL.findByAccountAndOrderIdWithAuthorizations(accountId, orderId);
    if (!order) {
      throw new NotFoundError({ message: "ACME order not found" });
    }
    if (order.status !== AcmeOrderStatus.Valid) {
      throw new AcmeOrderNotReadyError({ message: "ACME order is not valid" });
    }
    return {
      status: 200,
      body: order.certificateChain! + "\n" + order.certificate!,
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
    const profile = await validateAcmeProfile(profileId);
    // FIXME: Implement ACME list orders
    return {
      status: 200,
      body: {
        orders: []
      },
      headers: {
        Location: buildUrl(profileId, `/accounts/${accountId}/orders`),
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
    const result = await acmeChallengeDAL.findByAccountAuthAndChallengeId(accountId, authzId, challengeId);
    if (!result) {
      throw new NotFoundError({ message: "ACME challenge not found" });
    }
    await acmeChallengeService.validateChallengeResponse(challengeId);
    const challenge = (await acmeChallengeDAL.findByIdForChallengeValidation(challengeId))!;
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
