import { useCallback } from "react";
import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import {
  decryptAssymmetric,
  decryptSymmetric
} from "@app/components/utilities/cryptography/crypto";
import { apiRequest } from "@app/config/request";

import {
  TGetSecretRotationList,
  TGetSecretRotationProviders,
  TSecretRotation,
  TSecretRotationProviderList
} from "./types";

export const secretRotationKeys = {
  listProviders: ({ workspaceId }: TGetSecretRotationProviders) => [
    { workspaceId },
    "secret-rotation-providers"
  ],
  list: ({ workspaceId }: Omit<TGetSecretRotationList, "decryptFileKey">) =>
    [{ workspaceId }, "secret-rotations"] as const
};

const fetchSecretRotationProviders = async ({ workspaceId }: TGetSecretRotationProviders) => {
  const { data } = await apiRequest.get<TSecretRotationProviderList>(
    `/api/v1/secret-rotation-providers/${workspaceId}`
  );
  return data;
};

export const useGetSecretRotationProviders = ({
  workspaceId,
  options = {}
}: TGetSecretRotationProviders & {
  options?: Omit<
    UseQueryOptions<
      TSecretRotationProviderList,
      unknown,
      TSecretRotationProviderList,
      ReturnType<typeof secretRotationKeys.listProviders>
    >,
    "queryKey" | "queryFn"
  >;
}) =>
  useQuery({
    ...options,
    queryKey: secretRotationKeys.listProviders({ workspaceId }),
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
    queryFn: async () => fetchSecretRotationProviders({ workspaceId })
  });

const fetchSecretRotations = async ({
  workspaceId
}: Omit<TGetSecretRotationList, "decryptFileKey">) => {
  const { data } = await apiRequest.get<{ secretRotations: TSecretRotation[] }>(
    "/api/v1/secret-rotations",
    { params: { workspaceId } }
  );
  return data.secretRotations;
};

export const useGetSecretRotations = ({
  workspaceId,
  decryptFileKey,
  options = {}
}: TGetSecretRotationList & {
  options?: Omit<
    UseQueryOptions<
      TSecretRotation[],
      unknown,
      TSecretRotation<{ key: string }>[],
      ReturnType<typeof secretRotationKeys.list>
    >,
    "queryKey" | "queryFn"
  >;
}) =>
  useQuery({
    ...options,
    queryKey: secretRotationKeys.list({ workspaceId }),
    enabled: Boolean(workspaceId) && (options?.enabled ?? true),
    queryFn: async () => fetchSecretRotations({ workspaceId }),
    select: useCallback(
      (data: TSecretRotation[]) => {
        const PRIVATE_KEY = localStorage.getItem("PRIVATE_KEY") as string;
        const decryptKey = decryptAssymmetric({
          ciphertext: decryptFileKey.encryptedKey,
          nonce: decryptFileKey.nonce,
          publicKey: decryptFileKey.sender.publicKey,
          privateKey: PRIVATE_KEY
        });
        return data.map((el) => ({
          ...el,
          outputs: el.outputs.map(({ key, secret }) => ({
            key,
            secret: {
              key: decryptSymmetric({
                ciphertext: secret.secretValueCiphertext,
                iv: secret.secretValueIV,
                tag: secret.secretValueTag,
                key: decryptKey
              })
            }
          }))
        }));
      },
      [decryptFileKey]
    )
  });
