import { LightMyRequestResponse } from "fastify";

import { ProjectType } from "@app/db/schemas";

import { request } from "./request";

type TKmsKey = {
  id: string;
  name: string;
  isDisabled: boolean;
  isPublicKeyPublished: boolean;
  kid: string | null;
  jwksUrl: string | null;
};

type TPublicJwks = { keys: Record<string, string>[] };

const parseKey = (res: LightMyRequestResponse) => {
  expect(res.statusCode, res.body).toBe(200);
  return res.json<{ key: TKmsKey }>().key;
};

export const createKmsProject = (dto: { name: string; authToken: string }) =>
  request(
    {
      method: "POST",
      url: "/api/v1/projects",
      headers: { authorization: `Bearer ${dto.authToken}` },
      body: { projectName: dto.name, type: ProjectType.KMS }
    },
    (res) => {
      expect(res.statusCode, res.body).toBe(200);
      return res.json<{ project: { id: string } }>().project.id;
    }
  );

export const createKmsKey = (dto: {
  projectId: string;
  name: string;
  keyUsage: string;
  algorithm: string;
  isPublicKeyPublished?: boolean;
  authToken: string;
}) =>
  request(
    {
      method: "POST",
      url: "/api/v1/kms/keys",
      headers: { authorization: `Bearer ${dto.authToken}` },
      body: {
        projectId: dto.projectId,
        name: dto.name,
        keyUsage: dto.keyUsage,
        algorithm: dto.algorithm,
        isPublicKeyPublished: dto.isPublicKeyPublished
      }
    },
    parseKey
  );

export const updateKmsKey = (dto: { keyId: string; body: Record<string, unknown>; authToken: string }) =>
  request(
    {
      method: "PATCH",
      url: `/api/v1/kms/keys/${dto.keyId}`,
      headers: { authorization: `Bearer ${dto.authToken}` },
      body: dto.body
    },
    parseKey
  );

export const deleteKmsKey = (dto: { keyId: string; authToken: string }) =>
  request(
    {
      method: "DELETE",
      url: `/api/v1/kms/keys/${dto.keyId}`,
      headers: { authorization: `Bearer ${dto.authToken}` }
    },
    parseKey
  );

export const signWithKmsKey = (dto: { keyId: string; data: Buffer; signingAlgorithm: string; authToken: string }) =>
  request(
    {
      method: "POST",
      url: `/api/v1/kms/keys/${dto.keyId}/sign`,
      headers: { authorization: `Bearer ${dto.authToken}` },
      body: { data: dto.data.toString("base64"), signingAlgorithm: dto.signingAlgorithm }
    },
    (res) => {
      expect(res.statusCode, res.body).toBe(200);
      return Buffer.from(res.json<{ signature: string }>().signature, "base64");
    }
  );

// Unauthenticated, like the verifiers that call it
export const getKmsKeyPublicJwks = (dto: { keyId: string; ifNoneMatch?: string }) =>
  request(
    {
      method: "GET",
      url: `/api/v1/kms/keys/${dto.keyId}/jwks.json`,
      headers: dto.ifNoneMatch ? { "if-none-match": dto.ifNoneMatch } : {}
    },
    (res) => {
      expect(res.statusCode, res.body).toBe(200);
      return res.json<TPublicJwks>();
    }
  );
