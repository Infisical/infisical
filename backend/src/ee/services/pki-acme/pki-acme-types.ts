import { z } from "zod";

import { JWSHeaderParameters } from "jose";
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
  ProtectedHeaderSchema,
  RawJwsPayloadSchema,
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
export type TRawJwsPayload = z.infer<typeof RawJwsPayloadSchema>;
export type TProtectedHeader = z.infer<typeof ProtectedHeaderSchema>;
export type TCreateAcmeAccountPayload = z.infer<typeof CreateAcmeAccountBodySchema>;
export type TCreateAcmeOrderPayload = z.infer<typeof CreateAcmeOrderBodySchema>;
export type TDeactivateAcmeAccountPayload = z.infer<typeof DeactivateAcmeAccountBodySchema>;
export type TFinalizeAcmeOrderPayload = z.infer<typeof FinalizeAcmeOrderBodySchema>;

export type TJwsPayload<T> = {
  protectedHeader: TProtectedHeader;
  payload: T;
};
export type TAuthenciatedJwsPayload<T> = TJwsPayload<T> & {
  profileId: string;
  accountId: string;
};
export type TAcmeResponse<TPayload> = {
  status: number;
  headers: Record<string, string>;
  body: TPayload;
};

export type TPkiAcmeServiceFactory = {
  validateJwsPayload: <
    TSchema extends z.ZodSchema<any> | undefined = undefined,
    T = TSchema extends z.ZodSchema<infer R> ? R : string
  >(
    rawJwsPayload: TRawJwsPayload,
    getJWK: (protectedHeader: JWSHeaderParameters) => Promise<JsonWebKey>,
    schema?: TSchema
  ) => Promise<TJwsPayload<T>>;
  validateNewAccountJwsPayload: (rawJwsPayload: TRawJwsPayload) => Promise<TJwsPayload<TCreateAcmeAccountPayload>>;
  validateExistingAccountJwsPayload: <
    TSchema extends z.ZodSchema<any> | undefined = undefined,
    T = TSchema extends z.ZodSchema<infer R> ? R : string
  >({
    profileId,
    rawJwsPayload,
    schema,
    expectedAccountId
  }: {
    profileId: string;
    rawJwsPayload: TRawJwsPayload;
    schema?: TSchema;
    expectedAccountId?: string;
  }) => Promise<TAuthenciatedJwsPayload<T>>;
  getAcmeDirectory: (profileId: string) => Promise<TGetAcmeDirectoryResponse>;
  getAcmeNewNonce: (profileId: string) => Promise<string>;
  createAcmeAccount: ({
    profileId,
    alg,
    jwk,
    payload
  }: {
    profileId: string;
    alg: string;
    jwk: JsonWebKey;
    payload: TCreateAcmeAccountPayload;
  }) => Promise<TAcmeResponse<TCreateAcmeAccountResponse>>;
  createAcmeOrder: ({
    profileId,
    accountId,
    payload
  }: {
    profileId: string;
    accountId: string;
    payload: TCreateAcmeOrderPayload;
  }) => Promise<TAcmeResponse<TCreateAcmeOrderResponse>>;
  deactivateAcmeAccount: ({
    profileId,
    accountId,
    payload
  }: {
    profileId: string;
    accountId: string;
    payload?: TDeactivateAcmeAccountPayload;
  }) => Promise<TAcmeResponse<TDeactivateAcmeAccountResponse>>;
  listAcmeOrders: ({
    profileId,
    accountId
  }: {
    profileId: string;
    accountId: string;
  }) => Promise<TAcmeResponse<TListAcmeOrdersResponse>>;
  getAcmeOrder: ({
    profileId,
    accountId,
    orderId
  }: {
    profileId: string;
    accountId: string;
    orderId: string;
  }) => Promise<TAcmeResponse<TGetAcmeOrderResponse>>;
  finalizeAcmeOrder: ({
    profileId,
    accountId,
    orderId,
    payload
  }: {
    profileId: string;
    accountId: string;
    orderId: string;
    payload: TFinalizeAcmeOrderPayload;
  }) => Promise<TAcmeResponse<TFinalizeAcmeOrderResponse>>;
  downloadAcmeCertificate: ({
    profileId,
    orderId
  }: {
    profileId: string;
    orderId: string;
  }) => Promise<TAcmeResponse<string>>;
  getAcmeAuthorization: ({
    profileId,
    authzId
  }: {
    profileId: string;
    authzId: string;
  }) => Promise<TAcmeResponse<TGetAcmeAuthorizationResponse>>;
  respondToAcmeChallenge: ({
    profileId,
    authzId
  }: {
    profileId: string;
    authzId: string;
  }) => Promise<TAcmeResponse<TRespondToAcmeChallengeResponse>>;
};
