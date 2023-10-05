import {
  useInfiniteQuery,
  UseInfiniteQueryOptions,
  useQuery,
  UseQueryOptions
} from "@tanstack/react-query";

import {
  decryptAssymmetric,
  decryptSymmetric
} from "@app/components/utilities/cryptography/crypto";
import { apiRequest } from "@app/config/request";

import { UserWsKeyPair } from "../keys/types";
import { decryptSecrets } from "../secrets/queries";
import { DecryptedSecret } from "../secrets/types";
import {
  TGetSecretApprovalRequestCount,
  TGetSecretApprovalRequestDetails,
  TGetSecretApprovalRequestList,
  TSecretApprovalRequest,
  TSecretApprovalRequestCount,
  TSecretApprovalSecChange,
  TSecretApprovalSecChangeData
} from "./types";

export const secretApprovalRequestKeys = {
  list: ({
    workspaceId,
    environment,
    status,
    committer,
    offset,
    limit
  }: TGetSecretApprovalRequestList) =>
    [
      { workspaceId, environment, status, committer, offset, limit },
      "secret-approval-requests"
    ] as const,
  detail: ({ id }: Omit<TGetSecretApprovalRequestDetails, "decryptKey">) =>
    [{ id }, "secret-approval-request-detail"] as const,
  count: ({ workspaceId }: TGetSecretApprovalRequestCount) => [
    { workspaceId },
    "secret-approval-request-count"
  ]
};

export const decryptSecretApprovalSecret = (
  encSecret: TSecretApprovalSecChangeData,
  decryptFileKey: UserWsKeyPair
) => {
  const PRIVATE_KEY = localStorage.getItem("PRIVATE_KEY") as string;
  const key = decryptAssymmetric({
    ciphertext: decryptFileKey.encryptedKey,
    nonce: decryptFileKey.nonce,
    publicKey: decryptFileKey.sender.publicKey,
    privateKey: PRIVATE_KEY
  });

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
  return {
    _id: encSecret._id,
    version: encSecret.version,
    secretKey,
    secretValue,
    secretComment,
    tags: encSecret.tags
  };
};

const fetchSecretApprovalRequestList = async ({
  workspaceId,
  environment,
  committer,
  status = "open",
  limit = 20,
  offset
}: TGetSecretApprovalRequestList) => {
  const { data } = await apiRequest.get<{ approvals: TSecretApprovalRequest[] }>(
    "/api/v1/secret-approval-requests",
    {
      params: {
        workspaceId,
        environment,
        committer,
        status,
        limit,
        offset
      }
    }
  );

  return data.approvals;
};

export const useGetSecretApprovalRequests = ({
  workspaceId,
  environment,
  options = {},
  status,
  limit = 20,
  committer
}: TGetSecretApprovalRequestList & {
  options?: Omit<
    UseInfiniteQueryOptions<
      TSecretApprovalRequest[],
      unknown,
      TSecretApprovalRequest[],
      ReturnType<typeof secretApprovalRequestKeys.list>
    >,
    "queryKey" | "queryFn"
  >;
}) =>
  useInfiniteQuery({
    queryKey: secretApprovalRequestKeys.list({
      workspaceId,
      environment,
      committer,
      status
    }),
    queryFn: ({ pageParam }) =>
      fetchSecretApprovalRequestList({
        workspaceId,
        environment,
        status,
        committer,
        limit,
        offset: pageParam
      }),
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
    getNextPageParam: (lastPage, pages) => {
      if (lastPage.length && lastPage.length < limit) return undefined;

      return lastPage?.length !== 0 ? pages.length * limit : undefined;
    }
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
  decryptKey,
  options = {}
}: TGetSecretApprovalRequestDetails & {
  options?: Omit<
    UseQueryOptions<
      TSecretApprovalRequest,
      unknown,
      TSecretApprovalRequest<TSecretApprovalSecChange, DecryptedSecret>,
      ReturnType<typeof secretApprovalRequestKeys.detail>
    >,
    "queryKey" | "queryFn"
  >;
}) =>
  useQuery({
    queryKey: secretApprovalRequestKeys.detail({ id }),
    queryFn: () => fetchSecretApprovalRequestDetails({ id }),
    select: (data) => ({
      ...data,
      commits: data.commits.map(({ secretVersion, op, newVersion, secret }) => ({
        op,
        secret,
        secretVersion: secretVersion ? decryptSecrets([secretVersion], decryptKey)[0] : undefined,
        newVersion: newVersion ? decryptSecretApprovalSecret(newVersion, decryptKey) : undefined
      }))
    }),
    enabled: Boolean(id && decryptKey) && (options?.enabled ?? true)
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
    queryFn: () => fetchSecretApprovalRequestCount({ workspaceId }),
    enabled: Boolean(workspaceId) && (options?.enabled ?? true)
  });
