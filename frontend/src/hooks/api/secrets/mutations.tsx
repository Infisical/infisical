import crypto from "crypto";

import { MutationOptions, useMutation, useQueryClient } from "@tanstack/react-query";

import {
  decryptAssymmetric,
  encryptSymmetric
} from "@app/components/utilities/cryptography/crypto";
import { apiRequest } from "@app/config/request";

import { secretApprovalRequestKeys } from "../secretApprovalRequest/queries";
import { secretSnapshotKeys } from "../secretSnapshots/queries";
import { secretKeys } from "./queries";
import {
  CreateSecretDTO,
  TCreateSecretBatchDTO,
  TCreateSecretsV3DTO,
  TDeleteSecretBatchDTO,
  TDeleteSecretsV3DTO,
  TUpdateSecretBatchDTO,
  TUpdateSecretsV3DTO
} from "./types";

const encryptSecret = (randomBytes: string, key: string, value?: string, comment?: string) => {
  // encrypt key
  const {
    ciphertext: secretKeyCiphertext,
    iv: secretKeyIV,
    tag: secretKeyTag
  } = encryptSymmetric({
    plaintext: key,
    key: randomBytes
  });

  // encrypt value
  const {
    ciphertext: secretValueCiphertext,
    iv: secretValueIV,
    tag: secretValueTag
  } = encryptSymmetric({
    plaintext: value ?? "",
    key: randomBytes
  });

  // encrypt comment
  const {
    ciphertext: secretCommentCiphertext,
    iv: secretCommentIV,
    tag: secretCommentTag
  } = encryptSymmetric({
    plaintext: comment ?? "",
    key: randomBytes
  });

  return {
    secretKeyCiphertext,
    secretKeyIV,
    secretKeyTag,
    secretValueCiphertext,
    secretValueIV,
    secretValueTag,
    secretCommentCiphertext,
    secretCommentIV,
    secretCommentTag
  };
};

export const useCreateSecretV3 = ({
  options
}: {
  options?: Omit<MutationOptions<{}, {}, TCreateSecretsV3DTO>, "mutationFn">;
} = {}) => {
  const queryClient = useQueryClient();
  return useMutation<{}, {}, TCreateSecretsV3DTO>({
    mutationFn: async ({
      secretPath = "/",
      type,
      environment,
      workspaceId,
      secretName,
      secretValue,
      latestFileKey,
      secretComment,
      skipMultilineEncoding
    }) => {
      const PRIVATE_KEY = localStorage.getItem("PRIVATE_KEY") as string;

      const randomBytes = latestFileKey
        ? decryptAssymmetric({
            ciphertext: latestFileKey.encryptedKey,
            nonce: latestFileKey.nonce,
            publicKey: latestFileKey.sender.publicKey,
            privateKey: PRIVATE_KEY
          })
        : crypto.randomBytes(16).toString("hex");

      const reqBody = {
        workspaceId,
        environment,
        type,
        secretPath,
        ...encryptSecret(randomBytes, secretName, secretValue, secretComment),
        skipMultilineEncoding
      };
      const { data } = await apiRequest.post(`/api/v3/secrets/${secretName}`, reqBody);
      return data;
    },
    onSuccess: (_, { workspaceId, environment, secretPath }) => {
      queryClient.invalidateQueries(
        secretKeys.getProjectSecret({ workspaceId, environment, secretPath })
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.list({ environment, workspaceId, directory: secretPath })
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.count({ environment, workspaceId, directory: secretPath })
      );
      queryClient.invalidateQueries(secretApprovalRequestKeys.count({ workspaceId }));
    },
    ...options
  });
};

export const useUpdateSecretV3 = ({
  options
}: {
  options?: Omit<MutationOptions<{}, {}, TUpdateSecretsV3DTO>, "mutationFn">;
} = {}) => {
  const queryClient = useQueryClient();
  return useMutation<{}, {}, TUpdateSecretsV3DTO>({
    mutationFn: async ({
      secretPath = "/",
      type,
      secretId,
      environment,
      workspaceId,
      secretName,
      secretValue,
      latestFileKey,
      tags,
      secretComment,
      secretReminderRepeatDays,
      secretReminderNote,
      newSecretName,
      skipMultilineEncoding
    }) => {
      const PRIVATE_KEY = localStorage.getItem("PRIVATE_KEY") as string;

      const randomBytes = latestFileKey
        ? decryptAssymmetric({
            ciphertext: latestFileKey.encryptedKey,
            nonce: latestFileKey.nonce,
            publicKey: latestFileKey.sender.publicKey,
            privateKey: PRIVATE_KEY
          })
        : crypto.randomBytes(16).toString("hex");

      const reqBody = {
        workspaceId,
        environment,
        type,
        secretReminderNote,
        secretReminderRepeatDays,
        secretPath,
        secretId,
        ...encryptSecret(randomBytes, newSecretName ?? secretName, secretValue, secretComment),
        tags,
        skipMultilineEncoding,
        secretName: newSecretName
      };
      const { data } = await apiRequest.patch(`/api/v3/secrets/${secretName}`, reqBody);
      return data;
    },
    onSuccess: (_, { workspaceId, environment, secretPath }) => {
      queryClient.invalidateQueries(
        secretKeys.getProjectSecret({ workspaceId, environment, secretPath })
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.list({ environment, workspaceId, directory: secretPath })
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.count({ environment, workspaceId, directory: secretPath })
      );
      queryClient.invalidateQueries(secretApprovalRequestKeys.count({ workspaceId }));
    },
    ...options
  });
};

export const useDeleteSecretV3 = ({
  options
}: {
  options?: Omit<MutationOptions<{}, {}, TDeleteSecretsV3DTO>, "mutationFn">;
} = {}) => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TDeleteSecretsV3DTO>({
    mutationFn: async ({
      secretPath = "/",
      type,
      environment,
      workspaceId,
      secretName,
      secretId
    }) => {
      const reqBody = {
        workspaceId,
        environment,
        type,
        secretPath,
        secretId
      };

      const { data } = await apiRequest.delete(`/api/v3/secrets/${secretName}`, {
        data: reqBody
      });
      return data;
    },
    onSuccess: (_, { workspaceId, environment, secretPath }) => {
      queryClient.invalidateQueries(
        secretKeys.getProjectSecret({ workspaceId, environment, secretPath })
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.list({ environment, workspaceId, directory: secretPath })
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.count({ environment, workspaceId, directory: secretPath })
      );
      queryClient.invalidateQueries(secretApprovalRequestKeys.count({ workspaceId }));
    },
    ...options
  });
};

export const useCreateSecretBatch = ({
  options
}: {
  options?: Omit<MutationOptions<{}, {}, TCreateSecretBatchDTO>, "mutationFn">;
} = {}) => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TCreateSecretBatchDTO>({
    mutationFn: async ({ secretPath = "/", workspaceId, environment, secrets, latestFileKey }) => {
      const PRIVATE_KEY = localStorage.getItem("PRIVATE_KEY") as string;
      const randomBytes = latestFileKey
        ? decryptAssymmetric({
            ciphertext: latestFileKey.encryptedKey,
            nonce: latestFileKey.nonce,
            publicKey: latestFileKey.sender.publicKey,
            privateKey: PRIVATE_KEY
          })
        : crypto.randomBytes(16).toString("hex");

      const reqBody = {
        workspaceId,
        environment,
        secretPath,
        secrets: secrets.map(
          ({ secretName, secretValue, secretComment, metadata, type, skipMultilineEncoding }) => ({
            secretName,
            ...encryptSecret(randomBytes, secretName, secretValue, secretComment),
            type,
            metadata,
            skipMultilineEncoding
          })
        )
      };

      const { data } = await apiRequest.post("/api/v3/secrets/batch", reqBody);
      return data;
    },
    onSuccess: (_, { workspaceId, environment, secretPath }) => {
      queryClient.invalidateQueries(
        secretKeys.getProjectSecret({ workspaceId, environment, secretPath })
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.list({ environment, workspaceId, directory: secretPath })
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.count({ environment, workspaceId, directory: secretPath })
      );
      queryClient.invalidateQueries(secretApprovalRequestKeys.count({ workspaceId }));
    },
    ...options
  });
};

export const useUpdateSecretBatch = ({
  options
}: {
  options?: Omit<MutationOptions<{}, {}, TUpdateSecretBatchDTO>, "mutationFn">;
} = {}) => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TUpdateSecretBatchDTO>({
    mutationFn: async ({ secretPath = "/", workspaceId, environment, secrets, latestFileKey }) => {
      const PRIVATE_KEY = localStorage.getItem("PRIVATE_KEY") as string;
      const randomBytes = latestFileKey
        ? decryptAssymmetric({
            ciphertext: latestFileKey.encryptedKey,
            nonce: latestFileKey.nonce,
            publicKey: latestFileKey.sender.publicKey,
            privateKey: PRIVATE_KEY
          })
        : crypto.randomBytes(16).toString("hex");

      const reqBody = {
        workspaceId,
        environment,
        secretPath,
        secrets: secrets.map(
          ({ secretName, secretValue, secretComment, type, tags, skipMultilineEncoding }) => ({
            secretName,
            ...encryptSecret(randomBytes, secretName, secretValue, secretComment),
            type,
            tags,
            skipMultilineEncoding
          })
        )
      };

      const { data } = await apiRequest.patch("/api/v3/secrets/batch", reqBody);
      return data;
    },
    onSuccess: (_, { workspaceId, environment, secretPath }) => {
      queryClient.invalidateQueries(
        secretKeys.getProjectSecret({ workspaceId, environment, secretPath })
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.list({ environment, workspaceId, directory: secretPath })
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.count({ environment, workspaceId, directory: secretPath })
      );
      queryClient.invalidateQueries(secretApprovalRequestKeys.count({ workspaceId }));
    },
    ...options
  });
};

export const useDeleteSecretBatch = ({
  options
}: {
  options?: Omit<MutationOptions<{}, {}, TDeleteSecretBatchDTO>, "mutationFn">;
} = {}) => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TDeleteSecretBatchDTO>({
    mutationFn: async ({ secretPath = "/", workspaceId, environment, secrets }) => {
      const reqBody = {
        workspaceId,
        environment,
        secretPath,
        secrets
      };

      const { data } = await apiRequest.delete("/api/v3/secrets/batch", {
        data: reqBody
      });
      return data;
    },
    onSuccess: (_, { workspaceId, environment, secretPath }) => {
      queryClient.invalidateQueries(
        secretKeys.getProjectSecret({ workspaceId, environment, secretPath })
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.list({ environment, workspaceId, directory: secretPath })
      );
      queryClient.invalidateQueries(
        secretSnapshotKeys.count({ environment, workspaceId, directory: secretPath })
      );
      queryClient.invalidateQueries(secretApprovalRequestKeys.count({ workspaceId }));
    },
    ...options
  });
};

export const createSecret = async (dto: CreateSecretDTO) => {
  const { data } = await apiRequest.post(`/api/v3/secrets/${dto.secretKey}`, dto);
  return data;
};
