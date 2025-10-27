import { z } from "zod";

import {
  CreateAcmeAccountBodySchema,
  CreateAcmeAccountResponseSchema,
  CreateAcmeOrderBodySchema,
  CreateAcmeOrderResponseSchema,
  DeactivateAcmeAccountBodySchema,
  DeactivateAcmeAccountResponseSchema,
  FinalizeAcmeOrderBodySchema,
  FinalizeAcmeOrderResponseSchema,
  GetAcmeAuthorizationResponseSchema,
  GetAcmeDirectoryResponseSchema,
  GetAcmeOrderResponseSchema,
  ListAcmeOrdersResponseSchema,
  RespondToAcmeChallengeResponseSchema
} from "./pki-acme-schemas";

export type TGetAcmeDirectoryResponse = z.infer<typeof GetAcmeDirectoryResponseSchema>;
export type TCreateAcmeAccountResponse = z.infer<typeof CreateAcmeAccountResponseSchema>;
export type TCreateAcmeOrderResponse = z.infer<typeof CreateAcmeOrderResponseSchema>;
export type TDeactivateAcmeAccountResponse = z.infer<typeof DeactivateAcmeAccountResponseSchema>;
export type TListAcmeOrdersResponse = z.infer<typeof ListAcmeOrdersResponseSchema>;
export type TGetAcmeOrderResponse = z.infer<typeof GetAcmeOrderResponseSchema>;
export type TFinalizeAcmeOrderResponse = z.infer<typeof FinalizeAcmeOrderResponseSchema>;
export type TDownloadAcmeCertificateDTO = string;
export type TGetAcmeAuthorizationResponse = z.infer<typeof GetAcmeAuthorizationResponseSchema>;
export type TRespondToAcmeChallengeResponse = z.infer<typeof RespondToAcmeChallengeResponseSchema>;

// Payload types
export type TCreateAcmeAccountPayload = z.infer<typeof CreateAcmeAccountBodySchema>;
export type TCreateAcmeOrderPayload = z.infer<typeof CreateAcmeOrderBodySchema>;
export type TDeactivateAcmeAccountPayload = z.infer<typeof DeactivateAcmeAccountBodySchema>;
export type TFinalizeAcmeOrderPayload = z.infer<typeof FinalizeAcmeOrderBodySchema>;

export type TPkiAcmeServiceFactory = {
  getAcmeDirectory: (profileId: string) => Promise<TGetAcmeDirectoryResponse>;
  getAcmeNewNonce: (profileId: string) => Promise<string>;
  createAcmeAccount: (profileId: string, body: TCreateAcmeAccountPayload) => Promise<TCreateAcmeAccountResponse>;
  createAcmeOrder: (profileId: string, body: TCreateAcmeOrderPayload) => Promise<TCreateAcmeOrderResponse>;
  deactivateAcmeAccount: (
    profileId: string,
    accountId: string,
    body?: TDeactivateAcmeAccountPayload
  ) => Promise<TDeactivateAcmeAccountResponse>;
  listAcmeOrders: (profileId: string, accountId: string) => Promise<TListAcmeOrdersResponse>;
  getAcmeOrder: (profileId: string, orderId: string) => Promise<TGetAcmeOrderResponse>;
  finalizeAcmeOrder: (
    profileId: string,
    orderId: string,
    body: TFinalizeAcmeOrderPayload
  ) => Promise<TFinalizeAcmeOrderResponse>;
  downloadAcmeCertificate: (profileId: string, orderId: string) => Promise<string>;
  getAcmeAuthorization: (profileId: string, authzId: string) => Promise<TGetAcmeAuthorizationResponse>;
  respondToAcmeChallenge: (profileId: string, authzId: string) => Promise<TRespondToAcmeChallengeResponse>;
};
