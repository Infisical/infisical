import { SecretRotation } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-enums";

// Every spec drives the AWS IAM user secret rotation, which is faked for the whole e2e run. See
// e2e-test/fakes/aws-iam-user-secret-rotation-fns.ts and the alias block in
// vitest.e2e.config.mts. A second faked provider should take the type as an argument rather than
// copy this file.
const ROTATION = SecretRotation.AwsIamUserSecret;

export type TSecretRotationRecord = {
  id: string;
  name: string;
  activeIndex: number;
  rotationStatus: string;
  lastRotationMessage: string | null;
  isAutoRotationEnabled: boolean;
  nextRotationAt: string | null;
  lastRotatedAt: string;
};

type TGeneratedCredentials = { accessKeyId: string; secretAccessKey: string }[];

export const createSecretRotation = async (dto: {
  name: string;
  projectId: string;
  connectionId: string;
  environmentSlug: string;
  secretPath: string;
  // The two keys the rotation writes its credentials to. Everything a spec asserts about what
  // reaches the secret path is addressed by these.
  secretsMapping: { accessKeyId: string; secretAccessKey: string };
  userName?: string;
  isAutoRotationEnabled?: boolean;
  rotationInterval?: number;
  authToken: string;
  expectStatusCode?: number;
}) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v2/secret-rotations/${ROTATION}`,
    headers: { authorization: `Bearer ${dto.authToken}` },
    body: {
      name: dto.name,
      projectId: dto.projectId,
      connectionId: dto.connectionId,
      environment: dto.environmentSlug,
      secretPath: dto.secretPath,
      parameters: { userName: dto.userName ?? "infisical-e2e" },
      secretsMapping: dto.secretsMapping,
      // Off unless a spec asks for it: under NODE_ENV=test the rotation cron treats every
      // auto-enabled rotation as due and rotates it inline every minute, so one left enabled
      // would rotate underneath whichever spec is running when the minute turns.
      isAutoRotationEnabled: dto.isAutoRotationEnabled ?? false,
      rotationInterval: dto.rotationInterval ?? 30
    }
  });

  expect(res.statusCode).toBe(dto.expectStatusCode ?? 200);

  // A spec asserting a rejection wants the body, not an id.
  if ((dto.expectStatusCode ?? 200) !== 200) return { error: res.json() as { message: string } };

  return { secretRotation: res.json().secretRotation as TSecretRotationRecord };
};

// Rotates synchronously: the route awaits rotateGeneratedCredentials and answers with the
// updated rotation, so nothing here has to poll. The cron reaches the same service function.
export const rotateSecretRotation = async (dto: {
  rotationId: string;
  authToken: string;
  expectStatusCode?: number;
}) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v2/secret-rotations/${ROTATION}/${dto.rotationId}/rotate-secrets`,
    headers: { authorization: `Bearer ${dto.authToken}` }
  });

  expect(res.statusCode).toBe(dto.expectStatusCode ?? 200);

  if ((dto.expectStatusCode ?? 200) !== 200) return { error: res.json() as { message: string } };

  return { secretRotation: res.json().secretRotation as TSecretRotationRecord };
};

export const getSecretRotation = async (dto: { rotationId: string; authToken: string }) => {
  const res = await testServer.inject({
    method: "GET",
    url: `/api/v2/secret-rotations/${ROTATION}/${dto.rotationId}`,
    headers: { authorization: `Bearer ${dto.authToken}` }
  });

  expect(res.statusCode).toBe(200);
  return res.json().secretRotation as TSecretRotationRecord;
};

export const getGeneratedCredentials = async (dto: { rotationId: string; authToken: string }) => {
  const res = await testServer.inject({
    method: "GET",
    url: `/api/v2/secret-rotations/${ROTATION}/${dto.rotationId}/generated-credentials`,
    headers: { authorization: `Bearer ${dto.authToken}` }
  });

  expect(res.statusCode).toBe(200);

  // The route also answers with the rotation id and type, which every caller already knows.
  const { generatedCredentials, activeIndex } = res.json() as {
    generatedCredentials: TGeneratedCredentials;
    activeIndex: number;
  };

  return { generatedCredentials, activeIndex };
};

// Answers 204 with no body when the active credentials still work, and 400 with the provider's
// message when they do not.
export const checkRotationCredentials = async (dto: {
  rotationId: string;
  authToken: string;
  expectStatusCode?: number;
}) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v2/secret-rotations/${ROTATION}/${dto.rotationId}/check-credentials`,
    headers: { authorization: `Bearer ${dto.authToken}` }
  });

  expect(res.statusCode).toBe(dto.expectStatusCode ?? 204);

  return res.statusCode === 204 ? undefined : (res.json() as { message: string });
};

export const deleteSecretRotation = async (dto: {
  rotationId: string;
  deleteSecrets: boolean;
  revokeGeneratedCredentials: boolean;
  authToken: string;
}) => {
  const res = await testServer.inject({
    method: "DELETE",
    url: `/api/v2/secret-rotations/${ROTATION}/${dto.rotationId}`,
    headers: { authorization: `Bearer ${dto.authToken}` },
    query: {
      deleteSecrets: String(dto.deleteSecrets),
      revokeGeneratedCredentials: String(dto.revokeGeneratedCredentials)
    }
  });

  expect(res.statusCode).toBe(200);
};

export const listSecretRotations = async (dto: { projectId: string; authToken: string }) => {
  const res = await testServer.inject({
    method: "GET",
    url: `/api/v2/secret-rotations/${ROTATION}`,
    headers: { authorization: `Bearer ${dto.authToken}` },
    query: { projectId: dto.projectId }
  });

  expect(res.statusCode).toBe(200);
  return res.json().secretRotations as TSecretRotationRecord[];
};
