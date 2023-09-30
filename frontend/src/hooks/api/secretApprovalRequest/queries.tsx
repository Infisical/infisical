import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import {
  decryptAssymmetric,
  decryptSymmetric
} from "@app/components/utilities/cryptography/crypto";
import { apiRequest } from "@app/config/request";

import { UserWsKeyPair } from "../keys/types";
import { decryptSecrets } from "../secrets/queries";
import { DecryptedSecret } from "../secrets/types";
import {
  TGetSecretApprovalRequestDetails,
  TGetSecretApprovalRequestList,
  TSecretApprovalRequest,
  TSecretApprovalSecChange,
  TSecretApprovalSecChangeData
} from "./types";

export const secretApprovalRequestKeys = {
  list: ({ workspaceId, environment }: TGetSecretApprovalRequestList) =>
    [{ workspaceId, environment }, "secret-approval-requests"] as const,
  detail: ({ id }: Omit<TGetSecretApprovalRequestDetails, "decryptKey">) =>
    [{ id }, "secret-approval-request-detail"] as const
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
  environment
}: TGetSecretApprovalRequestList) => {
  const { data } = await apiRequest.get<{ approvals: TSecretApprovalRequest[] }>(
    "/api/v1/secret-approval-requests",
    {
      params: {
        workspaceId,
        environment
      }
    }
  );

  return data.approvals;
};

export const useGetSecretApprovalRequests = ({
  workspaceId,
  environment,
  options = {}
}: TGetSecretApprovalRequestList & {
  options?: Omit<
    UseQueryOptions<
      TSecretApprovalRequest[],
      unknown,
      TSecretApprovalRequest[],
      ReturnType<typeof secretApprovalRequestKeys.list>
    >,
    "queryKey" | "queryFn"
  >;
}) =>
  useQuery({
    queryKey: secretApprovalRequestKeys.list({ workspaceId, environment }),
    queryFn: () => fetchSecretApprovalRequestList({ workspaceId, environment }),
    enabled: Boolean(workspaceId) && (options?.enabled ?? true)
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
      commits: data.commits.map(({ secret, op, newVersion }) => ({
        op,
        secret: secret ? decryptSecrets([secret], decryptKey)[0] : undefined,
        newVersion: newVersion ? decryptSecretApprovalSecret(newVersion, decryptKey) : undefined
      }))
    }),
    enabled: Boolean(id && decryptKey) && (options?.enabled ?? true)
  });
