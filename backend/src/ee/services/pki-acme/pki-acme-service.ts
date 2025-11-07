import { TPkiAcmeAccounts } from "@app/db/schemas/pki-acme-accounts";
import { TPkiAcmeAuths } from "@app/db/schemas/pki-acme-auths";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TCertificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";
import * as x509 from "@peculiar/x509";

import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { isPrivateIp } from "@app/lib/ip/ipRange";
import { ActorType } from "@app/services/auth/auth-type";
import {
  EnrollmentType,
  TCertificateProfileWithConfigs
} from "@app/services/certificate-profile/certificate-profile-types";
import { TCertificateV3ServiceFactory } from "@app/services/certificate-v3/certificate-v3-service";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
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
  AcmeBadNonceError,
  AcmeBadPublicKeyError,
  AcmeError,
  AcmeExternalAccountRequiredError,
  AcmeMalformedError,
  AcmeOrderNotReadyError,
  AcmeServerInternalError,
  AcmeUnauthorizedError,
  AcmeUnsupportedIdentifierError
} from "./pki-acme-errors";
import { buildUrl, extractAccountIdFromKid } from "./pki-acme-fns";
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
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "findOne">;
  acmeAccountDAL: Pick<
    TPkiAcmeAccountDALFactory,
    "findByProjectIdAndAccountId" | "findByProfileIdAndPublicKeyThumbprintAndAlg" | "create"
  >;
  acmeOrderDAL: Pick<
    TPkiAcmeOrderDALFactory,
    | "create"
    | "transaction"
    | "updateById"
    | "findByAccountAndOrderIdWithAuthorizations"
    | "findByIdForFinalization"
    | "listByAccountId"
  >;
  acmeAuthDAL: Pick<TPkiAcmeAuthDALFactory, "create" | "findByAccountIdAndAuthIdWithChallenges">;
  acmeOrderAuthDAL: Pick<TPkiAcmeOrderAuthDALFactory, "insertMany">;
  acmeChallengeDAL: Pick<
    TPkiAcmeChallengeDALFactory,
    "create" | "transaction" | "updateById" | "findByAccountAuthAndChallengeId" | "findByIdForChallengeValidation"
  >;
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry" | "deleteItem">;
  kmsService: Pick<TKmsServiceFactory, "decryptWithKmsKey" | "generateKmsKey">;
  certificateV3Service: Pick<TCertificateV3ServiceFactory, "signCertificateFromProfile">;
  acmeChallengeService: TPkiAcmeChallengeServiceFactory;
};

export const pkiAcmeServiceFactory = ({
  projectDAL,
  certificateProfileDAL,
  certificateBodyDAL,
  acmeAccountDAL,
  acmeOrderDAL,
  acmeAuthDAL,
  acmeOrderAuthDAL,
  acmeChallengeDAL,
  keyStore,
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
          throw new AcmeMalformedError({ detail: "Protected header is required" });
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
        throw new AcmeMalformedError({ detail: `Invalid JWS payload: ${error.message}` });
      }
      if (error instanceof errors.JWSSignatureVerificationFailed) {
        throw new AcmeBadPublicKeyError({ detail: "Invalid JWS payload" });
      }
      logger.error(error, "Unexpected error while verifying JWS payload");
      throw new AcmeServerInternalError({ detail: "Failed to verify JWS payload" });
    }
    const { protectedHeader: rawProtectedHeader, payload: rawPayload } = result;
    try {
      const protectedHeader = ProtectedHeaderSchema.parse(rawProtectedHeader);
      // Validate the URL
      if (new URL(protectedHeader.url).href !== url.href) {
        throw new AcmeUnauthorizedError({ detail: "URL mismatch in the protected header" });
      }
      // Consume the nonce
      if (!protectedHeader.nonce) {
        throw new AcmeMalformedError({ detail: "Nonce is required in the protected header" });
      }
      const deleted = await keyStore.deleteItem(KeyStorePrefixes.PkiAcmeNonce(protectedHeader.nonce));
      if (deleted !== 1) {
        throw new AcmeBadNonceError({ detail: "Invalid nonce" });
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
        throw new AcmeMalformedError({ detail: `Invalid JWS payload: ${error.message}` });
      }
      logger.error(error, "Unexpected error while parsing JWS payload");
      throw new AcmeServerInternalError({ detail: "Failed to verify JWS payload" });
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
          throw new AcmeMalformedError({ detail: "JWK is required in the protected header" });
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

  const getAcmeDirectory = async (profileId: string): Promise<TGetAcmeDirectoryResponse> => {
    const profile = await validateAcmeProfile(profileId);
    return {
      newNonce: buildUrl(profile.id, "/new-nonce"),
      newAccount: buildUrl(profile.id, "/new-account"),
      newOrder: buildUrl(profile.id, "/new-order")
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
    const eabSecret = await kmsDecryptor({ cipherTextBlob: profile.acmeConfig!.encryptedEabSecret! });
    const { eabPayload, eabProtectedHeader } = await (async () => {
      try {
        const result = await flattenedVerify(externalAccountBinding, eabSecret);
        return { eabPayload: result.payload, eabProtectedHeader: result.protectedHeader };
      } catch (error) {
        if (error instanceof errors.JWSSignatureVerificationFailed) {
          throw new AcmeMalformedError({ detail: "Invalid external account binding JWS signature" });
        }
        logger.error(error, "Unexpected error while verifying EAB JWS signature");
        throw new AcmeServerInternalError({ detail: "Failed to verify EAB JWS signature" });
      }
    })();

    const { alg: eabAlg, kid: eabKid } = eabProtectedHeader!;
    if (!["HS256", "HS384", "HS512"].includes(eabAlg!)) {
      throw new AcmeMalformedError({ detail: "Invalid algorithm for external account binding JWS payload" });
    }
    // Make sure the KID in the EAB payload matches the profile ID
    if (eabKid !== profile.id) {
      throw new UnauthorizedError({ message: "External account binding KID mismatch" });
    }

    // Make sure the URL matches the expected URL
    const url = eabProtectedHeader!.url!;
    if (url !== buildUrl(profile.id, "/new-account")) {
      throw new UnauthorizedError({ message: "External account binding URL mismatch" });
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
    // TODO: check and see if we have existing orders for this account that meet the criteria
    //       if we do, return the existing order
    // TODO: check the identifiers and see if are they even allowed for this profile.
    //       if not, we may be able to reject it early with an unsupportedIdentifier error.

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
          if (identifier.type !== AcmeIdentifierType.DNS) {
            throw new AcmeUnsupportedIdentifierError({ detail: "Only DNS identifiers are supported" });
          }
          if (isPrivateIp(identifier.value)) {
            throw new AcmeUnsupportedIdentifierError({ detail: "Private IP addresses are not allowed" });
          }
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
        let errorToReturn: Error | undefined;
        try {
          const { certificateId } = await certificateV3Service.signCertificateFromProfile({
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
                  // TODO: read config from the profile to get the expiration time instead
                  ttl: (24 * 60 * 60 * 1000).toString()
                }
              : // ttl is not used if notAfter is provided
                ({ ttl: "0" } as const),
            enrollmentType: EnrollmentType.ACME
          });
          // TODO: associate the certificate with the order
          await acmeOrderDAL.updateById(
            orderId,
            {
              status: AcmeOrderStatus.Valid,
              csr,
              certificateId
            },
            tx
          );
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
            errorToReturn = new AcmeBadCSRError({ detail: `Invalid CSR: ${exp.message}` });
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
    const profile = await validateAcmeProfile(profileId);
    const order = await acmeOrderDAL.findByAccountAndOrderIdWithAuthorizations(accountId, orderId);
    if (!order) {
      throw new NotFoundError({ message: "ACME order not found" });
    }
    if (order.status !== AcmeOrderStatus.Valid) {
      throw new AcmeOrderNotReadyError({ message: "ACME order is not valid" });
    }
    if (!order.certificateId) {
      throw new NotFoundError({ message: "The certificate for this ACME order no longer exists" });
    }

    const certBody = await certificateBodyDAL.findOne({ certId: order.certificateId });
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
