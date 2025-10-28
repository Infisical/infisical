import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { TCertificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";

import { AcmeMalformedError, AcmeBadPublicKeyError } from "./pki-acme-errors";

import {
  EnrollmentType,
  TCertificateProfileWithConfigs
} from "@app/services/certificate-profile/certificate-profile-types";
import {
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
  TRawJwsPayload,
  TListAcmeOrdersResponse,
  TPkiAcmeServiceFactory,
  TRespondToAcmeChallengeResponse,
  TJwsPayload,
  TProtectedHeader
} from "./pki-acme-types";
import { flattenedVerify, importJWK, JWK, JWSHeaderParameters } from "jose";

type TPkiAcmeServiceFactoryDep = {
  certificateProfileDAL: Pick<TCertificateProfileDALFactory, "findById">;
};

export const pkiAcmeServiceFactory = ({ certificateProfileDAL }: TPkiAcmeServiceFactoryDep): TPkiAcmeServiceFactory => {
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

  const validateCreateAcmeAccountJwsPayload = async (rawPayload: TRawJwsPayload): Promise<TJwsPayload> => {
    const { payload, protectedHeader } = await flattenedVerify(
      rawPayload,
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
    const decoder = new TextDecoder();
    const parsedPayload = JSON.parse(decoder.decode(payload)) as TCreateAcmeAccountPayload;
    // TODO: also consume the nonce here
    return { payload: parsedPayload, protectedHeader: protectedHeader as TProtectedHeader };
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
    payload: TCreateAcmeAccountPayload
  ): Promise<TCreateAcmeAccountResponse> => {
    const profile = await validateAcmeProfile(profileId);
    // FIXME: Implement ACME new account registration
    // Use EAB authentication to find corresponding Infisical machine identity
    // Check permissions and return account information
    const accountId = "FIXME-account-id";
    return {
      status: "valid",
      accountUrl: buildUrl(`/api/v1/pki/acme/profiles/${profileId}/accounts/${accountId}`),
      contact: [],
      orders: buildUrl(`/api/v1/pki/acme/profiles/${profileId}/accounts/${accountId}/orders`)
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
