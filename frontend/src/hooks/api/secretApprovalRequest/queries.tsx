/* eslint-disable no-param-reassign */
import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import {
  decryptAssymmetric,
  decryptSymmetric
} from "@app/components/utilities/cryptography/crypto";
import { apiRequest } from "@app/config/request";
import { TReactQueryOptions } from "@app/types/reactQuery";

import { UserWsKeyPair } from "../keys/types";
import { EncryptedSecret, SecretType, SecretV3RawSanitized } from "../secrets/types";
import {
  TGetSecretApprovalRequestCount,
  TGetSecretApprovalRequestDetails,
  TGetSecretApprovalRequestList,
  TSecretApprovalRequest,
  TSecretApprovalRequestCount
} from "./types";

export const secretApprovalRequestKeys = {
  list: ({
    workspaceId,
    environment,
    status,
    committer,
    offset,
    limit,
    search
  }: TGetSecretApprovalRequestList) =>
    [
      { workspaceId, environment, status, committer, offset, limit, search },
      "secret-approval-requests"
    ] as const,
  detail: ({ id }: Omit<TGetSecretApprovalRequestDetails, "decryptKey">) =>
    [{ id }, "secret-approval-request-detail"] as const,
  count: ({ workspaceId }: TGetSecretApprovalRequestCount) => [
    { workspaceId },
    "secret-approval-request-count"
  ]
};

export const decryptSecrets = (
  encryptedSecrets: EncryptedSecret[],
  decryptFileKey: UserWsKeyPair
) => {
  const PRIVATE_KEY = localStorage.getItem("PRIVATE_KEY") as string;
  const key = decryptAssymmetric({
    ciphertext: decryptFileKey.encryptedKey,
    nonce: decryptFileKey.nonce,
    publicKey: decryptFileKey.sender.publicKey,
    privateKey: PRIVATE_KEY
  });

  const personalSecrets: Record<string, { id: string; value: string }> = {};
  const secrets: SecretV3RawSanitized[] = [];
  encryptedSecrets.forEach((encSecret) => {
    const secretKey = decryptSymmetric({
      ciphertext: encSecret.secretKeyCiphertext,
      iv: encSecret.secretKeyIV,
      tag: encSecret.secretKeyTag,
      key
    });

    const secretValue = decryptSymmetric({
      ciphertext: encSecret.secretValueCiphertext,
      iv: encSecret.secretValueIV,
      tag: encSecret.secretValueTag,
      key
    });

    const secretComment = decryptSymmetric({
      ciphertext: encSecret.secretCommentCiphertext,
      iv: encSecret.secretCommentIV,
      tag: encSecret.secretCommentTag,
      key
    });

    const decryptedSecret: SecretV3RawSanitized = {
      id: encSecret.id,
      env: encSecret.environment,
      key: secretKey,
      secretValueHidden: encSecret.secretValueHidden,
      value: secretValue,
      tags: encSecret.tags,
      comment: secretComment,
      reminderRepeatDays: encSecret.secretReminderRepeatDays,
      reminderNote: encSecret.secretReminderNote,
      createdAt: encSecret.createdAt,
      updatedAt: encSecret.updatedAt,
      version: encSecret.version,
      skipMultilineEncoding: encSecret.skipMultilineEncoding
    };

    if (encSecret.type === SecretType.Personal) {
      personalSecrets[decryptedSecret.key] = {
        id: encSecret.id,
        value: secretValue
      };
    } else {
      secrets.push(decryptedSecret);
    }
  });

  secrets.forEach((sec) => {
    if (personalSecrets?.[sec.key]) {
      sec.idOverride = personalSecrets[sec.key].id;
      sec.valueOverride = personalSecrets[sec.key].value;
      sec.overrideAction = "modified";
    }
  });

  return secrets;
};

const fetchSecretApprovalRequestList = async ({
  workspaceId,
  environment,
  committer,
  status = "open",
  limit = 20,
  offset = 0,
  search = ""
}: TGetSecretApprovalRequestList) => {
  const { data } = await apiRequest.get<{
    approvals: TSecretApprovalRequest[];
    totalCount: number;
  }>("/api/v1/secret-approval-requests", {
    params: {
      workspaceId,
      environment,
      committer,
      status,
      limit,
      offset,
      search
    }
  });

  return data;
};

export const useGetSecretApprovalRequests = ({
  workspaceId,
  environment,
  options = {},
  status,
  limit = 20,
  offset = 0,
  search,
  committer
}: TGetSecretApprovalRequestList & TReactQueryOptions) =>
  useQuery({
    queryKey: secretApprovalRequestKeys.list({
      workspaceId,
      environment,
      committer,
      status,
      limit,
      search,
      offset
    }),
    queryFn: () =>
      fetchSecretApprovalRequestList({
        workspaceId,
        environment,
        status,
        committer,
        limit,
        offset,
        search
      }),
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
    placeholderData: (previousData) => previousData
  });

const fetchSecretApprovalRequestDetails = async ({
  id
}: Omit<TGetSecretApprovalRequestDetails, "decryptKey">) => {
  const { data } = await apiRequest.get<{ approval: TSecretApprovalRequest }>(
    `/api/v1/secret-approval-requests/${id}`
  );

  return data.approval;
};

export const useGetSecretApprovalRequestDetails = ({
  id,
  options = {}
}: TGetSecretApprovalRequestDetails & {
  options?: Omit<
    UseQueryOptions<
      TSecretApprovalRequest,
      unknown,
      TSecretApprovalRequest,
      ReturnType<typeof secretApprovalRequestKeys.detail>
    >,
    "queryKey" | "queryFn"
  >;
}) =>
  useQuery({
    queryKey: secretApprovalRequestKeys.detail({ id }),
    queryFn: () => fetchSecretApprovalRequestDetails({ id }),
    enabled: Boolean(id) && (options?.enabled ?? true)
  });

const fetchSecretApprovalRequestCount = async ({ workspaceId }: TGetSecretApprovalRequestCount) => {
  const { data } = await apiRequest.get<{ approvals: TSecretApprovalRequestCount }>(
    "/api/v1/secret-approval-requests/count",
    { params: { workspaceId } }
  );

  return data.approvals;
};

export const useGetSecretApprovalRequestCount = ({
  workspaceId,
  options = {}
}: TGetSecretApprovalRequestCount & {
  options?: Omit<
    UseQueryOptions<
      TSecretApprovalRequestCount,
      unknown,
      TSecretApprovalRequestCount,
      ReturnType<typeof secretApprovalRequestKeys.count>
    >,
    "queryKey" | "queryFn"
  >;
}) =>
  useQuery({
    queryKey: secretApprovalRequestKeys.count({ workspaceId }),
    refetchInterval: 15000,
    queryFn: () => fetchSecretApprovalRequestCount({ workspaceId }),
    enabled: Boolean(workspaceId) && (options?.enabled ?? true)
  });
