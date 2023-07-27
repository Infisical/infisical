import crypto from "crypto";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  decryptAssymmetric,
  encryptSymmetric
} from "@app/components/utilities/cryptography/crypto";
import { apiRequest } from "@app/config/request";

import { secretKeys } from "./queries";
import { TCreateSecretsV3DTO, TDeleteSecretsV3DTO, TUpdateSecretsV3DTO } from "./types";

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

export const useCreateSecretV3 = () => {
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
      secretComment
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
        ...encryptSecret(randomBytes, secretName, secretValue, secretComment)
      };
      const { data } = await apiRequest.post(`/api/v3/secrets/${secretName}`, reqBody);
      return data;
    },
    onSuccess: (_, { workspaceId, environment, secretPath }) => {
      queryClient.invalidateQueries(
        secretKeys.getProjectSecret(workspaceId, environment, secretPath)
      );
    }
  });
};

export const useUpdateSecretV3 = () => {
  const queryClient = useQueryClient();
  return useMutation<{}, {}, TUpdateSecretsV3DTO>({
    mutationFn: async ({
      secretPath = "/",
      type,
      environment,
      workspaceId,
      secretName,
      secretValue,
      latestFileKey
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
      const { secretValueIV, secretValueTag, secretValueCiphertext } = encryptSecret(
        randomBytes,
        secretName,
        secretValue,
        ""
      );

      const reqBody = {
        workspaceId,
        environment,
        type,
        secretPath,
        secretValueIV,
        secretValueTag,
        secretValueCiphertext
      };
      const { data } = await apiRequest.patch(`/api/v3/secrets/${secretName}`, reqBody);
      return data;
    },
    onSuccess: (_, { workspaceId, environment, secretPath }) => {
      queryClient.invalidateQueries(
        secretKeys.getProjectSecret(workspaceId, environment, secretPath)
      );
    }
  });
};

export const useDeleteSecretV3 = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, TDeleteSecretsV3DTO>({
    mutationFn: async ({ secretPath = "/", type, environment, workspaceId, secretName }) => {
      const reqBody = {
        workspaceId,
        environment,
        type,
        secretPath
      };

      const { data } = await apiRequest.delete(`/api/v3/secrets/${secretName}`, {
        data: reqBody
      });
      return data;
    },
    onSuccess: (_, { workspaceId, environment, secretPath }) => {
      queryClient.invalidateQueries(
        secretKeys.getProjectSecret(workspaceId, environment, secretPath)
      );
    }
  });
};
