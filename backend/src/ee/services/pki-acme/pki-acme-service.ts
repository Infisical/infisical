import { getConfig } from "@app/lib/config/env";
import { NotFoundError } from "@app/lib/errors";

import { TCertificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";

import {
  TCreateAcmeAccountResponse,
  TCreateAcmeOrderResponse,
  TDeactivateAcmeAccountResponse,
  TDownloadAcmeCertificateDTO,
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

  const getAcmeDirectory = async (profileId: string): Promise<TGetAcmeDirectoryResponse> => {
    // FIXME: Implement ACME directory endpoint
    // Validate profile exists and is for ACME enrollment
    // const profile = await certificateProfileDAL.findById(profileId);
    // if (!profile) {
    //   throw new NotFoundError({ message: "Certificate profile not found" });
    // }

    // FIXME: Validate profile is configured for ACME enrollment

    // Return absolute URLs using SITE_URL
    const baseUrl = appCfg.SITE_URL ?? "";
    return {
      newNonce: `${baseUrl}/api/v1/pki/acme/profiles/${profileId}/new-nonce`,
      newAccount: `${baseUrl}/api/v1/pki/acme/profiles/${profileId}/new-account`,
      newOrder: `${baseUrl}/api/v1/pki/acme/profiles/${profileId}/new-order`
    };
  };

  const getAcmeNewNonce = async (profileId: string): Promise<string> => {
    // FIXME: Implement ACME new nonce generation
    // Generate a new nonce, store it, and return it
    return "FIXME-generate-nonce";
  };

  const createAcmeAccount = async (profileId: string, body: unknown): Promise<TCreateAcmeAccountResponse> => {
    // FIXME: Implement ACME new account registration
    // Use EAB authentication to find corresponding Infisical machine identity
    // Check permissions and return account information
    const baseUrl = appCfg.SITE_URL || "";
    const accountId = "FIXME-account-id";
    return {
      status: "valid",
      accountUrl: `${baseUrl}/api/v1/pki/acme/profiles/${profileId}/accounts/${accountId}`,
      contact: [],
      orders: `${baseUrl}/api/v1/pki/acme/profiles/${profileId}/accounts/${accountId}/orders`
    };
  };

  const createAcmeOrder = async (profileId: string, body: unknown): Promise<TCreateAcmeOrderResponse> => {
    // FIXME: Implement ACME new order creation
    const orderId = "FIXME-order-id";
    const baseUrl = appCfg.SITE_URL || "";
    return {
      status: "pending",
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      identifiers: [],
      authorizations: [],
      finalize: `${baseUrl}/api/v1/pki/acme/profiles/${profileId}/orders/${orderId}/finalize`
    };
  };

  const deactivateAcmeAccount = async (
    profileId: string,
    accountId: string
  ): Promise<TDeactivateAcmeAccountResponse> => {
    // FIXME: Implement ACME account deactivation
    return {
      status: "deactivated"
    };
  };

  const listAcmeOrders = async (profileId: string, accountId: string): Promise<TListAcmeOrdersResponse> => {
    // FIXME: Implement ACME list orders
    return {
      orders: []
    };
  };

  const getAcmeOrder = async (profileId: string, orderId: string): Promise<TGetAcmeOrderResponse> => {
    // FIXME: Implement ACME get order
    const baseUrl = appCfg.SITE_URL || "";
    return {
      status: "pending",
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      identifiers: [],
      authorizations: [],
      finalize: `${baseUrl}/api/v1/pki/acme/profiles/${profileId}/orders/${orderId}/finalize`
    };
  };

  const finalizeAcmeOrder = async (
    profileId: string,
    orderId: string,
    csr: string
  ): Promise<TFinalizeAcmeOrderResponse> => {
    // FIXME: Implement ACME finalize order
    const baseUrl = appCfg.SITE_URL || "";
    return {
      status: "processing",
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      identifiers: [],
      authorizations: [],
      finalize: `${baseUrl}/api/v1/pki/acme/profiles/${profileId}/orders/${orderId}/finalize`,
      certificate: `${baseUrl}/api/v1/pki/acme/profiles/${profileId}/orders/${orderId}/certificate`
    };
  };

  const downloadAcmeCertificate = async (profileId: string, orderId: string): Promise<string> => {
    // FIXME: Implement ACME certificate download
    // Return the certificate in PEM format
    return "FIXME-certificate-pem";
  };

  const getAcmeAuthorization = async (profileId: string, authzId: string): Promise<TGetAcmeAuthorizationResponse> => {
    // FIXME: Implement ACME authorization retrieval
    const baseUrl = appCfg.SITE_URL || "";
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
          url: `${baseUrl}/api/v1/pki/acme/profiles/${profileId}/authorizations/${authzId}/challenges/http-01`,
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
    // FIXME: Implement ACME challenge response
    // Trigger verification process
    const baseUrl = appCfg.SITE_URL || "";
    return {
      type: "http-01",
      url: `${baseUrl}/api/v1/pki/acme/profiles/${profileId}/authorizations/${authzId}/challenges/http-01`,
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
