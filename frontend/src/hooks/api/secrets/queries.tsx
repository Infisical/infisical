/* eslint-disable no-param-reassign */
import { useCallback, useMemo } from "react";
import { useQueries, useQuery, UseQueryOptions } from "@tanstack/react-query";
import axios from "axios";

import { createNotification } from "@app/components/notifications";
import { apiRequest } from "@app/config/request";
import { useToggle } from "@app/hooks/useToggle";

import { ERROR_NOT_ALLOWED_READ_SECRETS } from "./constants";
import {
  GetSecretVersionsDTO,
  SecretAccessListEntry,
  SecretType,
  SecretV3Raw,
  SecretV3RawResponse,
  SecretV3RawSanitized,
  SecretVersions,
  TGetProjectSecretsAllEnvDTO,
  TGetProjectSecretsDTO,
  TGetProjectSecretsKey,
  TGetSecretAccessListDTO,
  TGetSecretReferenceTreeDTO,
  TSecretReferenceTraceNode
} from "./types";

export const secretKeys = {
  // this is also used in secretSnapshot part
  getProjectSecret: ({
    workspaceId,
    environment,
    secretPath,
    viewSecretValue
  }: TGetProjectSecretsKey) =>
    [{ workspaceId, environment, secretPath, viewSecretValue }, "secrets"] as const,
  getSecretVersion: (secretId: string) => [{ secretId }, "secret-versions"] as const,
  getSecretAccessList: ({
    workspaceId,
    environment,
    secretPath,
    secretKey
  }: TGetSecretAccessListDTO) =>
    ["secret-access-list", { workspaceId, environment, secretPath, secretKey }] as const,
  getSecretReferenceTree: (dto: TGetSecretReferenceTreeDTO) => ["secret-reference-tree", dto]
};

export const fetchProjectSecrets = async ({
  workspaceId,
  environment,
  secretPath,
  includeImports,
  expandSecretReferences,
  viewSecretValue
}: TGetProjectSecretsKey) => {
  const { data } = await apiRequest.get<SecretV3RawResponse>("/api/v3/secrets/raw", {
    params: {
      environment,
      workspaceId,
      secretPath,
      viewSecretValue,
      expandSecretReferences,
      include_imports: includeImports
    }
  });

  return data;
};

export const mergePersonalSecrets = (rawSecrets: SecretV3Raw[]) => {
  const personalSecrets: Record<string, { id: string; value?: string; env: string }> = {};
  const secrets: SecretV3RawSanitized[] = [];
  rawSecrets.forEach((el) => {
    const decryptedSecret: SecretV3RawSanitized = {
      id: el.id,
      env: el.environment,
      key: el.secretKey,
      value: el.secretValue,
      secretValueHidden: el.secretValueHidden,
      tags: el.tags || [],
      comment: el.secretComment || "",
      reminderRepeatDays: el.secretReminderRepeatDays,
      reminderNote: el.secretReminderNote,
      secretReminderRecipients: el.secretReminderRecipients,
      createdAt: el.createdAt,
      updatedAt: el.updatedAt,
      version: el.version,
      skipMultilineEncoding: el.skipMultilineEncoding,
      path: el.secretPath,
      secretMetadata: el.secretMetadata,
      isRotatedSecret: el.isRotatedSecret,
      rotationId: el.rotationId
    };

    if (el.type === SecretType.Personal) {
      personalSecrets[decryptedSecret.key] = {
        id: el.id,
        value: el.secretValue,
        env: el.environment
      };
    } else {
      secrets.push(decryptedSecret);
    }
  });

  secrets.forEach((sec) => {
    const personalSecret = personalSecrets?.[sec.key];
    if (personalSecret && personalSecret.env === sec.env) {
      sec.idOverride = personalSecret.id;
      sec.valueOverride = personalSecret.value;
      sec.overrideAction = "modified";
    }
  });

  return secrets;
};

export const useGetProjectSecrets = ({
  workspaceId,
  environment,
  secretPath,
  viewSecretValue,
  options
}: TGetProjectSecretsDTO & {
  options?: Omit<
    UseQueryOptions<
      SecretV3RawResponse,
      unknown,
      SecretV3RawSanitized[],
      ReturnType<typeof secretKeys.getProjectSecret>
    >,
    "queryKey" | "queryFn"
  >;
}) =>
  useQuery({
    ...options,
    // wait for all values to be available
    enabled: Boolean(workspaceId && environment) && (options?.enabled ?? true),
    queryKey: secretKeys.getProjectSecret({
      workspaceId,
      environment,
      secretPath,
      viewSecretValue
    }),
    queryFn: () => fetchProjectSecrets({ workspaceId, environment, secretPath, viewSecretValue }),
    select: useCallback(
      (data: Awaited<ReturnType<typeof fetchProjectSecrets>>) => mergePersonalSecrets(data.secrets),
      []
    )
  });

export const useGetProjectSecretsAllEnv = ({
  workspaceId,
  envs,
  secretPath
}: TGetProjectSecretsAllEnvDTO) => {
  const [isErrorHandled, setIsErrorHandled] = useToggle(false);

  const secrets = useQueries({
    queries: envs.map((environment) => ({
      queryKey: secretKeys.getProjectSecret({
        workspaceId,
        environment,
        secretPath
      }),
      enabled: Boolean(workspaceId && environment),
      onError: (error: unknown) => {
        if (axios.isAxiosError(error) && !isErrorHandled) {
          const { message, requestId } = error.response?.data as {
            message: string;
            requestId: string;
          };
          if (message !== ERROR_NOT_ALLOWED_READ_SECRETS) {
            createNotification({
              title: "Error fetching secrets",
              type: "error",
              text: message,
              copyActions: [
                {
                  value: requestId,
                  name: "Request ID",
                  label: `Request ID: ${requestId}`
                }
              ]
            });
          }
          setIsErrorHandled.on();
        }
      },
      queryFn: () => fetchProjectSecrets({ workspaceId, environment, secretPath }),
      staleTime: 60 * 1000,
      // eslint-disable-next-line react-hooks/rules-of-hooks
      select: useCallback(
        (data: Awaited<ReturnType<typeof fetchProjectSecrets>>) =>
          mergePersonalSecrets(data.secrets).reduce<Record<string, SecretV3RawSanitized>>(
            (prev, curr) => ({ ...prev, [curr.key]: curr }),
            {}
          ),
        []
      )
    }))
  });

  const secKeys = useMemo(() => {
    const keys = new Set<string>();
    secrets?.forEach(({ data }) => {
      // TODO(akhilmhdh): find out why this is unknown
      Object.keys(data || {}).forEach((key) => keys.add(key));
    });
    return [...keys];
  }, [(secrets || []).map((sec) => sec.data)]);

  const getEnvSecretKeyCount = useCallback(
    (env: string) => {
      const selectedEnvIndex = envs.indexOf(env);
      if (selectedEnvIndex !== -1) {
        return Object.keys(secrets[selectedEnvIndex]?.data || {}).length;
      }
      return 0;
    },
    [(secrets || []).map((sec) => sec.data)]
  );

  const getSecretByKey = useCallback(
    (env: string, key: string) => {
      const selectedEnvIndex = envs.indexOf(env);
      if (selectedEnvIndex !== -1) {
        const sec = secrets[selectedEnvIndex]?.data?.[key];
        return sec;
      }
      return undefined;
    },
    [(secrets || []).map((sec) => sec.data)]
  );

  return { data: secrets, secKeys, getSecretByKey, getEnvSecretKeyCount };
};

const fetchEncryptedSecretVersion = async (secretId: string, offset: number, limit: number) => {
  const { data } = await apiRequest.get<{ secretVersions: SecretVersions[] }>(
    `/api/v1/secret/${secretId}/secret-versions`,
    {
      params: {
        limit,
        offset
      }
    }
  );
  return data.secretVersions;
};

export const useGetSecretVersion = (dto: GetSecretVersionsDTO) =>
  useQuery({
    enabled: Boolean(dto.secretId),
    queryKey: secretKeys.getSecretVersion(dto.secretId),
    queryFn: () => fetchEncryptedSecretVersion(dto.secretId, dto.offset, dto.limit),
    select: useCallback((data: SecretVersions[]) => {
      return data.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }, [])
  });

export const useGetSecretAccessList = (dto: TGetSecretAccessListDTO) =>
  useQuery({
    enabled: Boolean(dto.secretKey),
    queryKey: secretKeys.getSecretAccessList(dto),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        groups: SecretAccessListEntry[];
        identities: SecretAccessListEntry[];
        users: SecretAccessListEntry[];
      }>(`/api/v1/secrets/${dto.secretKey}/access-list`, {
        params: {
          workspaceId: dto.workspaceId,
          environment: dto.environment,
          secretPath: dto.secretPath
        }
      });

      return data;
    }
  });

const fetchSecretReferenceTree = async ({
  secretPath,
  projectId,
  secretKey,
  environmentSlug
}: TGetSecretReferenceTreeDTO) => {
  const { data } = await apiRequest.get<{ tree: TSecretReferenceTraceNode; value: string }>(
    `/api/v3/secrets/raw/${secretKey}/secret-reference-tree`,
    {
      params: {
        secretPath,
        workspaceId: projectId,
        environment: environmentSlug
      }
    }
  );
  return data;
};

export const useGetSecretReferenceTree = (dto: TGetSecretReferenceTreeDTO) =>
  useQuery({
    enabled:
      Boolean(dto.environmentSlug) &&
      Boolean(dto.secretPath) &&
      Boolean(dto.projectId) &&
      Boolean(dto.secretKey),
    queryKey: secretKeys.getSecretReferenceTree(dto),
    queryFn: () => fetchSecretReferenceTree(dto)
  });
