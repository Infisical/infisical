import { z } from "zod";

import { JWSHeaderParameters } from "jose";
import {
  AcmeOrderResourceSchema,
  CreateAcmeAccountBodySchema,
  CreateAcmeAccountResponseSchema,
  CreateAcmeOrderBodySchema,
  DeactivateAcmeAccountBodySchema,
  DeactivateAcmeAccountResponseSchema,
  FinalizeAcmeOrderBodySchema,
  GetAcmeAuthorizationResponseSchema,
  GetAcmeDirectoryResponseSchema,
  ListAcmeOrdersResponseSchema,
  ProtectedHeaderSchema,
  RawJwsPayloadSchema,
  RespondToAcmeChallengeResponseSchema
} from "./pki-acme-schemas";

export type TGetAcmeDirectoryResponse = z.infer<typeof GetAcmeDirectoryResponseSchema>;
export type TCreateAcmeAccountResponse = z.infer<typeof CreateAcmeAccountResponseSchema>;
export type TAcmeOrderResource = z.infer<typeof AcmeOrderResourceSchema>;
export type TDeactivateAcmeAccountResponse = z.infer<typeof DeactivateAcmeAccountResponseSchema>;
export type TListAcmeOrdersResponse = z.infer<typeof ListAcmeOrdersResponseSchema>;
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
  >({
    url,
    rawJwsPayload,
    getJWK,
    schema
  }: {
    url: string;
    rawJwsPayload: TRawJwsPayload;
    getJWK: (protectedHeader: JWSHeaderParameters) => Promise<JsonWebKey>;
    schema?: z.ZodSchema<any>;
  }) => Promise<TJwsPayload<any>>;
  validateNewAccountJwsPayload: ({
    url,
    rawJwsPayload
  }: {
    url: string;
    rawJwsPayload: TRawJwsPayload;
  }) => Promise<TJwsPayload<TCreateAcmeAccountPayload>>;
  validateExistingAccountJwsPayload: <
    TSchema extends z.ZodSchema<any> | undefined = undefined,
    T = TSchema extends z.ZodSchema<infer R> ? R : string
  >({
    url,
    profileId,
    rawJwsPayload,
    schema,
    expectedAccountId
  }: {
    url: string;
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
  deactivateAcmeAccount: ({
    profileId,
    accountId,
    payload
  }: {
    profileId: string;
    accountId: string;
    payload?: TDeactivateAcmeAccountPayload;
  }) => Promise<TAcmeResponse<TDeactivateAcmeAccountResponse>>;
  createAcmeOrder: ({
    profileId,
    accountId,
    payload
  }: {
    profileId: string;
    accountId: string;
    payload: TCreateAcmeOrderPayload;
  }) => Promise<TAcmeResponse<TAcmeOrderResource>>;
  getAcmeOrder: ({
    profileId,
    accountId,
    orderId
  }: {
    profileId: string;
    accountId: string;
    orderId: string;
  }) => Promise<TAcmeResponse<TAcmeOrderResource>>;
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
  }) => Promise<TAcmeResponse<TAcmeOrderResource>>;
  downloadAcmeCertificate: ({
    profileId,
    accountId,
    orderId
  }: {
    profileId: string;
    accountId: string;
    orderId: string;
  }) => Promise<TAcmeResponse<string>>;
  listAcmeOrders: ({
    profileId,
    accountId
  }: {
    profileId: string;
    accountId: string;
  }) => Promise<TAcmeResponse<TListAcmeOrdersResponse>>;
  getAcmeAuthorization: ({
    profileId,
    accountId,
    authzId
  }: {
    profileId: string;
    accountId: string;
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
