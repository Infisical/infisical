import { getConfig } from "@app/lib/config/env";
import { NotFoundError } from "@app/lib/errors";

import { TCertificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";

import { AcmeAccountDoesNotExistError, AcmeBadPublicKeyError, AcmeMalformedError } from "./pki-acme-errors";

import {
  EnrollmentType,
  TCertificateProfileWithConfigs
} from "@app/services/certificate-profile/certificate-profile-types";
import { flattenedVerify, importJWK, JWK, JWSHeaderParameters } from "jose";
import { ProtectedHeaderSchema } from "./pki-acme-schemas";
import {
  TAcmeResponse,
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
  TJwsPayloadWithJwk,
  TListAcmeOrdersResponse,
  TPkiAcmeServiceFactory,
  TRawJwsPayload,
  TRespondToAcmeChallengeResponse
} from "./pki-acme-types";
import { TPkiAcmeAccount } from "@app/db/schemas/pki-acme-accounts";
import { TPkiAcmeAccountDALFactory } from "./pki-acme-account-dal";

type TPkiAcmeServiceFactoryDep = {
  certificateProfileDAL: Pick<TCertificateProfileDALFactory, "findById">;
  pkiAcmeAccountDAL: Pick<TPkiAcmeAccountDALFactory, "findByPublicKey" | "create">;
};

export const pkiAcmeServiceFactory = ({
  certificateProfileDAL,
  pkiAcmeAccountDAL
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

  const validateCreateAcmeAccountJwsPayload = async (rawJwsPayload: TRawJwsPayload): Promise<TJwsPayloadWithJwk> => {
    const { payload: rawPayload, protectedHeader: rawProtectedHeader } = await flattenedVerify(
      rawJwsPayload,
      async (protectedHeader: JWSHeaderParameters | undefined) => {
        if (protectedHeader === undefined) {
          throw new AcmeMalformedError({ detail: "Protected header is required" });
        }
        if (protectedHeader.jwk === undefined) {
          throw new AcmeBadPublicKeyError({ detail: "JWK is required in the protected header" });
        }
        // For the create account request, the JWK is provided in the protected header.
        // Let use it to verify the signature.
        const imported = await importJWK(protectedHeader.jwk as JWK, protectedHeader.alg);
        return imported;
      }
    );
    const { success, data: protectedHeader } = ProtectedHeaderSchema.safeParse(rawProtectedHeader);
    if (!success) {
      throw new AcmeMalformedError({ detail: "Invalid protected header" });
    }

    const decoder = new TextDecoder();
    const payload = JSON.parse(decoder.decode(rawPayload)) as TCreateAcmeAccountPayload;
    // TODO: also consume the nonce here
    return { payload, protectedHeader, jwk: protectedHeader.jwk as JsonWebKey };
  };

  const getAcmeDirectory = async (profileId: string): Promise<TGetAcmeDirectoryResponse> => {
    await validateAcmeProfile(profileId);
    return {
      newNonce: buildUrl(`/api/v1/pki/acme/profiles/${profileId}/new-nonce`),
      newAccount: buildUrl(`/api/v1/pki/acme/profiles/${profileId}/new-account`),
      newOrder: buildUrl(`/api/v1/pki/acme/profiles/${profileId}/new-order`)
    };
  };

  const getAcmeNewNonce = async (profileId: string): Promise<string> => {
    const profile = await validateAcmeProfile(profileId);
    // FIXME: Implement ACME new nonce generation
    // Generate a new nonce, store it, and return it
    return "FIXME-generate-nonce";
  };

  const createAcmeAccount = async (
    profileId: string,
    jwk: JWK,
    { onlyReturnExisting, contact }: TCreateAcmeAccountPayload
  ): Promise<TAcmeResponse<TCreateAcmeAccountResponse>> => {
    const profile = await validateAcmeProfile(profileId);
    // TODO: the jwk as json obj may not be the best idea for indexing.
    // Maybe we should find a way to serialize the jwk deterministically.
    let account: TPkiAcmeAccount | null = await pkiAcmeAccountDAL.findByPublicKey(jwk);
    if (onlyReturnExisting && !account) {
      throw new AcmeAccountDoesNotExistError({ message: "ACME account not found" });
    }
    if (account) {
      // With the same public key, we found an existing account, just return it
      return {
        status: 200,
        body: {
          status: "valid",
          contact: account.emails,
          orders: buildUrl(`/api/v1/pki/acme/profiles/${profileId}/accounts/${account.id}/orders`)
        },
        headers: {
          Location: buildUrl(`/api/v1/pki/acme/profiles/${profileId}/accounts/${account.id}`)
        }
      };
    }

    account = await pkiAcmeAccountDAL.create({
      profileId,
      publicKey: jwk,
      emails: contact ?? []
    });
    // TODO: check EAB authentication here
    return {
      status: 201,
      body: {
        status: "valid",
        contact: account.emails,
        orders: buildUrl(`/api/v1/pki/acme/profiles/${profileId}/accounts/${account.id}/orders`)
      },
      headers: {
        Location: buildUrl(`/api/v1/pki/acme/profiles/${profileId}/accounts/${account.id}`)
      }
    };
  };

  const createAcmeOrder = async (
    profileId: string,
    payload: TCreateAcmeOrderPayload
  ): Promise<TCreateAcmeOrderResponse> => {
    const profile = await validateAcmeProfile(profileId);

    // FIXME: Implement ACME new order creation
    const orderId = "FIXME-order-id";
    return {
      status: "pending",
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      identifiers: [],
      authorizations: [],
      finalize: buildUrl(`/api/v1/pki/acme/profiles/${profileId}/orders/${orderId}/finalize`)
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
    validateCreateAcmeAccountJwsPayload,
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
