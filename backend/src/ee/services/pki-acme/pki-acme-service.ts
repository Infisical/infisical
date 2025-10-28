import { getConfig } from "@app/lib/config/env";
import { NotFoundError } from "@app/lib/errors";

import { TCertificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";

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
  TListAcmeOrdersResponse,
  TPkiAcmeServiceFactory,
  TRespondToAcmeChallengeResponse
} from "./pki-acme-types";

type TPkiAcmeServiceFactoryDep = {
  certificateProfileDAL: Pick<TCertificateProfileDALFactory, "findById">;
};

export const pkiAcmeServiceFactory = ({ certificateProfileDAL }: TPkiAcmeServiceFactoryDep): TPkiAcmeServiceFactory => {
  const appCfg = getConfig();

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
    const baseUrl = appCfg.SITE_URL ?? "";
    return `${baseUrl}${path}`;
  };

  const getAcmeDirectory = async (profileId: string): Promise<TGetAcmeDirectoryResponse> => {
    // FIXME: Implement ACME directory endpoint
    // Validate profile exists and is for ACME enrollment
    const profile = await validateAcmeProfile(profileId);

    // FIXME: Validate profile is configured for ACME enrollment

    // Return absolute URLs using SITE_URL
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
    body: TCreateAcmeAccountPayload
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
    body: TCreateAcmeOrderPayload
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
    body?: TDeactivateAcmeAccountPayload
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
    body: TFinalizeAcmeOrderPayload
  ): Promise<TFinalizeAcmeOrderResponse> => {
    const profile = await validateAcmeProfile(profileId);
    const { csr } = body;
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
