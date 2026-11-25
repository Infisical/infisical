import RE2 from "re2";
import { z } from "zod";

import { TDynamicSecrets } from "@app/db/schemas";
import { TProjectPermission } from "@app/lib/types";

export enum DynamicSecretUserCredentialStatus {
  Active = "active",
  ReauthorizationRequired = "reauthorization-required"
}

// Returned as the `error` field, so an application can tell this refusal apart from others and send the user
// through authorization again.
export const USER_REAUTHORIZATION_REQUIRED_ERROR_NAME = "UserReauthorizationRequired";

const EXTERNAL_USER_ID_REGEX = new RE2(/^[A-Za-z0-9._@|:+=-]+$/);

export const DynamicSecretExternalUserIdSchema = z
  .string()
  .trim()
  .min(1, "External user ID is required")
  .max(255)
  .refine(
    (value) => EXTERNAL_USER_ID_REGEX.test(value),
    "External user ID can only contain letters, numbers, and the characters . _ @ | : + = -"
  );

export type TDynamicSecretUserCredentialSecrets = {
  accessToken: string;
  refreshToken: string;
  tokenType?: string;
  scope?: string;
};

export type TRefreshedUserTokens = {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  requestedAt: number;
  expiresAt: number | null;
};

export type TUserTokenRefreshResult =
  | ({ status: "refreshed" } & TRefreshedUserTokens)
  | { status: "rejected"; reason: string };

export type TIssuedUserAccessToken = {
  accessToken: string;
  tokenType?: string;
  scope?: string;
  requestedAt: number;
  expiresAt: number | null;
};

export type TIssueUserAccessTokenDTO = {
  dynamicSecret: Pick<TDynamicSecrets, "id" | "name">;
  projectId: string;
  externalUserId: string;
  leaseEndsAt: number;
  refresh: (refreshToken: string) => Promise<TUserTokenRefreshResult>;
};

type TDynamicSecretLocationDTO = {
  name: string;
  path: string;
  environmentSlug: string;
  projectSlug: string;
} & Omit<TProjectPermission, "projectId">;

export type TUpsertDynamicSecretUserCredentialDTO = TDynamicSecretLocationDTO & {
  externalUserId: string;
  accessToken: string;
  refreshToken: string;
  expiresInSeconds?: number;
  tokenType?: string;
  scope?: string;
};

export type TListDynamicSecretUserCredentialsDTO = TDynamicSecretLocationDTO & {
  offset: number;
  limit: number;
};

export type TGetDynamicSecretUserCredentialDTO = TDynamicSecretLocationDTO & {
  externalUserId: string;
};

export type TDeleteDynamicSecretUserCredentialDTO = TDynamicSecretLocationDTO & {
  externalUserId: string;
};
