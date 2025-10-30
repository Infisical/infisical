import { getConfig } from "@app/lib/config/env";
import { NotFoundError } from "@app/lib/errors";

import { TCertificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";

import {
  AcmeAccountDoesNotExistError,
  AcmeBadPublicKeyError,
  AcmeMalformedError,
  AcmeServerInternalError
} from "./pki-acme-errors";

import { TPkiAcmeAccounts } from "@app/db/schemas/pki-acme-accounts";
import { TPkiAcmeAuths } from "@app/db/schemas/pki-acme-auths";
import { logger } from "@app/lib/logger";
import {
  EnrollmentType,
  TCertificateProfileWithConfigs
} from "@app/services/certificate-profile/certificate-profile-types";
import { errors, flattenedVerify, FlattenedVerifyResult, importJWK, JWSHeaderParameters } from "jose";
import { z, ZodError } from "zod";
import { TPkiAcmeAccountDALFactory } from "./pki-acme-account-dal";
import { TPkiAcmeAuthDALFactory } from "./pki-acme-auth-dal";
import { TPkiAcmeOrderDALFactory } from "./pki-acme-order-dal";
import { TPkiAcmeOrderAuthDALFactory } from "./pki-acme-order-auth-dal";
import {
  AcmeAuthStatus,
  AcmeIdentifierType,
  AcmeOrderStatus,
  CreateAcmeAccountBodySchema,
  ProtectedHeaderSchema
} from "./pki-acme-schemas";
import {
  TAcmeResponse,
  TAuthenciatedJwsPayload,
  TCreateAcmeAccountPayload,
  TCreateAcmeAccountResponse,
  TCreateAcmeOrderPayload,
  TCreateAcmeOrderResponse,
  TDeactivateAcmeAccountPayload,
  TDeactivateAcmeAccountResponse,
  TFinalizeAcmeOrderPayload,
  TFinalizeAcmeOrderResponse,
  TGetAcmeAuthorizationResponse,
  TGetAcmeDirectoryResponse,
  TGetAcmeOrderResponse,
  TJwsPayload,
  TListAcmeOrdersResponse,
  TPkiAcmeServiceFactory,
  TRawJwsPayload,
  TRespondToAcmeChallengeResponse
} from "./pki-acme-types";

type TPkiAcmeServiceFactoryDep = {
  certificateProfileDAL: Pick<TCertificateProfileDALFactory, "findById">;
  acmeAccountDAL: Pick<TPkiAcmeAccountDALFactory, "findById" | "findByPublicKey" | "create">;
  acmeOrderDAL: Pick<TPkiAcmeOrderDALFactory, "create" | "transaction">;
  acmeAuthDAL: Pick<TPkiAcmeAuthDALFactory, "create">;
  acmeOrderAuthDAL: Pick<TPkiAcmeOrderAuthDALFactory, "insertMany">;
};

export const pkiAcmeServiceFactory = ({
  certificateProfileDAL,
  acmeAccountDAL,
  acmeOrderDAL,
  acmeAuthDAL,
  acmeOrderAuthDAL
}: TPkiAcmeServiceFactoryDep): TPkiAcmeServiceFactory => {
  const validateAcmeProfile = async (profileId: string): Promise<TCertificateProfileWithConfigs> => {
    const profile = await certificateProfileDAL.findById(profileId);
    if (!profile) {
      throw new NotFoundError({ message: "Certificate profile not found" });
    }
    if (profile.enrollmentType !== EnrollmentType.ACME) {
      throw new NotFoundError({ message: "Certificate profile is not configured for ACME enrollment" });
    }
    return profile;
  };

  const buildUrl = (path: string): string => {
    const appCfg = getConfig();
    const baseUrl = appCfg.SITE_URL ?? "";
    return `${baseUrl}${path}`;
  };

  const extractAccountIdFromKid = (kid: string, profileId: string): string => {
    const kidPrefix = buildUrl(`/api/v1/pki/acme/profiles/${profileId}/accounts/`);
    if (!kid.startsWith(kidPrefix)) {
      throw new AcmeMalformedError({ detail: "KID must start with the profile account URL" });
    }
    return kid.slice(kidPrefix.length);
  };

  const validateJwsPayload = async <T>(
    rawJwsPayload: TRawJwsPayload,
    getJWK: (protectedHeader: JWSHeaderParameters) => Promise<JsonWebKey>,
    schema: z.ZodSchema<T>
  ): Promise<TJwsPayload<T>> => {
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
      // TODO: consume the nonce here
      const decoder = new TextDecoder();
      const jsonPayload = JSON.parse(decoder.decode(rawPayload));
      const payload = schema.parse(jsonPayload);
      return {
        protectedHeader,
        payload
      };
    } catch (error) {
      if (error instanceof ZodError) {
        throw new AcmeMalformedError({ detail: `Invalid JWS payload: ${error.message}` });
      }
      logger.error(error, "Unexpected error while parsing JWS payload");
      throw new AcmeServerInternalError({ detail: "Failed to verify JWS payload" });
    }
  };

  const validateNewAccountJwsPayload = async (
    rawJwsPayload: TRawJwsPayload
  ): Promise<TJwsPayload<TCreateAcmeAccountPayload>> => {
    return await validateJwsPayload(
      rawJwsPayload,
      async (protectedHeader) => {
        if (!protectedHeader.jwk) {
          throw new AcmeMalformedError({ detail: "JWK is required in the protected header" });
        }
        return protectedHeader.jwk as unknown as JsonWebKey;
      },
      CreateAcmeAccountBodySchema
    );
  };

  const validateExistingAccountJwsPayload = async <T>(
    profileId: string,
    rawJwsPayload: TRawJwsPayload,
    schema: z.ZodSchema<T>
  ): Promise<TAuthenciatedJwsPayload<T>> => {
    const profile = await validateAcmeProfile(profileId);
    const result = await validateJwsPayload(
      rawJwsPayload,
      async (protectedHeader) => {
        if (!protectedHeader.kid) {
          throw new AcmeMalformedError({ detail: "KID is required in the protected header" });
        }
        const accountId = extractAccountIdFromKid(protectedHeader.kid, profileId);
        const account = await acmeAccountDAL.findById(profile.id, accountId);
        if (!account) {
          throw new AcmeAccountDoesNotExistError({ message: "ACME account not found" });
        }
        if (account.alg !== protectedHeader.alg) {
          throw new AcmeMalformedError({ detail: "ACME account algorithm mismatch" });
        }
        return account.publicKey as JsonWebKey;
      },
      schema
    );
    return {
      ...result,
      accountId: extractAccountIdFromKid(result.protectedHeader.kid!, profileId)
    };
  };

  const getAcmeDirectory = async (profileId: string): Promise<TGetAcmeDirectoryResponse> => {
    const profile = await validateAcmeProfile(profileId);
    return {
      newNonce: buildUrl(`/api/v1/pki/acme/profiles/${profile.id}/new-nonce`),
      newAccount: buildUrl(`/api/v1/pki/acme/profiles/${profile.id}/new-account`),
      newOrder: buildUrl(`/api/v1/pki/acme/profiles/${profile.id}/new-order`)
    };
  };

  const getAcmeNewNonce = async (profileId: string): Promise<string> => {
    const profile = await validateAcmeProfile(profileId);
    // FIXME: Implement ACME new nonce generation
    // Generate a new nonce, store it, and return it
    return "FIXME-generate-nonce";
  };

  const createAcmeAccount = async ({
    profileId,
    alg,
    jwk,
    payload: { onlyReturnExisting, contact }
  }: {
    profileId: string;
    alg: string;
    jwk: JsonWebKey;
    payload: TCreateAcmeAccountPayload;
  }): Promise<TAcmeResponse<TCreateAcmeAccountResponse>> => {
    const profile = await validateAcmeProfile(profileId);
    const existingAccount: TPkiAcmeAccounts | null = await acmeAccountDAL.findByPublicKey(profileId, alg, jwk);
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
          orders: buildUrl(`/api/v1/pki/acme/profiles/${profile.id}/accounts/${existingAccount.id}/orders`)
        },
        headers: {
          Location: buildUrl(`/api/v1/pki/acme/profiles/${profile.id}/accounts/${existingAccount.id}`)
        }
      };
    }

    const newAccount = await acmeAccountDAL.create({
      profileId: profile.id,
      alg,
      publicKey: jwk,
      emails: contact ?? []
    });
    // TODO: check EAB authentication here
    return {
      status: 201,
      body: {
        status: "valid",
        contact: newAccount.emails,
        orders: buildUrl(`/api/v1/pki/acme/profiles/${profile.id}/accounts/${newAccount.id}/orders`)
      },
      headers: {
        Location: buildUrl(`/api/v1/pki/acme/profiles/${profile.id}/accounts/${newAccount.id}`)
      }
    };
  };

  const createAcmeOrder = async ({
    profileId,
    accountId,
    payload
  }: {
    profileId: string;
    accountId: string;
    payload: TCreateAcmeOrderPayload;
  }): Promise<TAcmeResponse<TCreateAcmeOrderResponse>> => {
    // TODO: check and see if we have existing orders for this account that meet the criteria
    //       if we do, return the existing order

    const order = await acmeOrderDAL.transaction(async (tx) => {
      const account = await acmeAccountDAL.findById(profileId, accountId)!;
      const createdOrder = await acmeOrderDAL.create(
        {
          accountId: account.id,
          status: AcmeOrderStatus.Pending
        },
        tx
      );
      const authorizations: TPkiAcmeAuths[] = await Promise.all(
        payload.identifiers.map(async (identifier) => {
          if (identifier.type === AcmeIdentifierType.DNS) {
            // TODO: reuse existing authorizations for this identifier if they exist
            return await acmeAuthDAL.create({
              accountId: account.id,
              status: AcmeAuthStatus.Pending,
              identifierType: identifier.type,
              identifierValue: identifier.value,
              // TODO: read config from the profile to get the expiration time instead
              expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
            });
          } else {
            throw new AcmeMalformedError({ detail: "Only DNS identifiers are supported" });
          }
        })
      );

      await acmeOrderAuthDAL.insertMany(
        authorizations.map((auth) => ({
          orderId: createdOrder.id,
          authId: auth.id
        }))
      );
      return { ...createdOrder, authorizations, account };
    });

    return {
      status: 201,
      body: {
        status: "pending",
        // TODO: read config from the profile to get the expiration time instead
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        identifiers: order.authorizations.map((auth) => ({
          type: auth.identifierType,
          value: auth.identifierValue
        })),
        authorizations: order.authorizations.map((auth) => ({
          id: auth.id,
          status: auth.status,
          identifier: {
            type: auth.identifierType,
            value: auth.identifierValue
          }
        })),
        finalize: buildUrl(`/api/v1/pki/acme/profiles/${order.account.profileId}/orders/${order.id}/finalize`)
      },
      headers: {
        Location: buildUrl(`/api/v1/pki/acme/profiles/${order.account.profileId}/orders/${order.id}`)
      }
    };
  };

  const deactivateAcmeAccount = async (
    profileId: string,
    accountId: string,
    payload?: TDeactivateAcmeAccountPayload
  ): Promise<TDeactivateAcmeAccountResponse> => {
    const profile = await validateAcmeProfile(profileId);
    // FIXME: Implement ACME account deactivation
    return {
      status: "deactivated"
    };
  };

  const listAcmeOrders = async (profileId: string, accountId: string): Promise<TListAcmeOrdersResponse> => {
    const profile = await validateAcmeProfile(profileId);
    // FIXME: Implement ACME list orders
    return {
      orders: []
    };
  };

  const getAcmeOrder = async (profileId: string, orderId: string): Promise<TGetAcmeOrderResponse> => {
    const profile = await validateAcmeProfile(profileId);
    // FIXME: Implement ACME get order
    return {
      status: "pending",
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      identifiers: [],
      authorizations: [],
      finalize: buildUrl(`/api/v1/pki/acme/profiles/${profileId}/orders/${orderId}/finalize`)
    };
  };

  const finalizeAcmeOrder = async (
    profileId: string,
    orderId: string,
    payload: TFinalizeAcmeOrderPayload
  ): Promise<TFinalizeAcmeOrderResponse> => {
    const profile = await validateAcmeProfile(profileId);
    const { csr } = payload;
    // FIXME: Implement ACME finalize order
    return {
      status: "processing",
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      identifiers: [],
      authorizations: [],
      finalize: buildUrl(`/api/v1/pki/acme/profiles/${profileId}/orders/${orderId}/finalize`),
      certificate: buildUrl(`/api/v1/pki/acme/profiles/${profileId}/orders/${orderId}/certificate`)
    };
  };

  const downloadAcmeCertificate = async (profileId: string, orderId: string): Promise<string> => {
    const profile = await validateAcmeProfile(profileId);
    // FIXME: Implement ACME certificate download
    // Return the certificate in PEM format
    return "FIXME-certificate-pem";
  };

  const getAcmeAuthorization = async (profileId: string, authzId: string): Promise<TGetAcmeAuthorizationResponse> => {
    const profile = await validateAcmeProfile(profileId);
    // FIXME: Implement ACME authorization retrieval
    return {
      status: "pending",
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      identifier: {
        type: "dns",
        value: "FIXME-domain-name"
      },
      challenges: [
        {
          type: "http-01",
          url: buildUrl(`/api/v1/pki/acme/profiles/${profileId}/authorizations/${authzId}/challenges/http-01`),
          status: "pending",
          token: "FIXME-challenge-token"
        }
      ]
    };
  };

  const respondToAcmeChallenge = async (
    profileId: string,
    authzId: string
  ): Promise<TRespondToAcmeChallengeResponse> => {
    const profile = await validateAcmeProfile(profileId);
    // FIXME: Implement ACME challenge response
    // Trigger verification process
    return {
      type: "http-01",
      url: buildUrl(`/api/v1/pki/acme/profiles/${profileId}/authorizations/${authzId}/challenges/http-01`),
      status: "pending",
      token: "FIXME-challenge-token"
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
