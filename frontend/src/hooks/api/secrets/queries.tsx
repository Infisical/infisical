/* eslint-disable no-param-reassign */
import { useCallback, useMemo } from "react";
import { useQueries, useQuery, UseQueryOptions } from "@tanstack/react-query";
import axios from "axios";

import { createNotification } from "@app/components/notifications";
import { apiRequest } from "@app/config/request";
import { useToggle } from "@app/hooks/useToggle";
import { HIDDEN_SECRET_VALUE } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/SecretItem";

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
  TGetSecretReferencesDTO,
  TGetSecretReferenceTreeDTO,
  TGetSecretVersionValue,
  TSecretDependencyTreeNode,
  TSecretReferenceTraceNode,
  TSecretVersionValue
} from "./types";

export const secretKeys = {
  // this is also used in secretSnapshot part
  getProjectSecret: ({
    projectId,
    environment,
    secretPath,
    viewSecretValue
  }: TGetProjectSecretsKey) =>
    [{ projectId, environment, secretPath, viewSecretValue }, "secrets"] as const,
  getSecretVersion: (secretId: string) => [{ secretId }, "secret-versions"] as const,
  getSecretVersionValue: (secretId: string, version: number) =>
    ["secret-versions", secretId, version] as const,
  getSecretAccessList: ({
    projectId,
    environment,
    secretPath,
    secretKey
  }: TGetSecretAccessListDTO) =>
    ["secret-access-list", { projectId, environment, secretPath, secretKey }] as const,
  getSecretReferenceTree: (dto: TGetSecretReferenceTreeDTO) => ["secret-reference-tree", dto],
  getSecretReferences: (dto: TGetSecretReferencesDTO) => ["secret-references", dto]
};

export const fetchProjectSecrets = async ({
  projectId,
  environment,
  secretPath,
  includeImports,
  expandSecretReferences,
  viewSecretValue
}: TGetProjectSecretsKey) => {
  const { data } = await apiRequest.get<SecretV3RawResponse>("/api/v4/secrets", {
    params: {
      environment,
      projectId,
      secretPath,
      viewSecretValue,
      expandSecretReferences,
      include_imports: includeImports
    }
  });

  return data;
};

export const mergePersonalSecrets = (rawSecrets: SecretV3Raw[]) => {
  const personalSecrets: Record<
    string,
    { id: string; value?: string; env: string; isEmpty?: boolean }
  > = {};
  const secrets: SecretV3RawSanitized[] = [];
  rawSecrets.forEach((el) => {
    const decryptedSecret: SecretV3RawSanitized = {
      id: el.id,
      env: el.environment,
      key: el.secretKey,
      value: el.secretValueHidden ? HIDDEN_SECRET_VALUE : el.secretValue,
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
      rotationId: el.rotationId,
      reminder: el.reminder,
      isEmpty: el.isEmpty
    };

    if (el.type === SecretType.Personal) {
      personalSecrets[decryptedSecret.key] = {
        id: el.id,
        value: el.secretValue,
        env: el.environment,
        isEmpty: el.isEmpty
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
      sec.isEmpty = personalSecret.isEmpty;
      sec.secretValueHidden = false;
    }
  });

  return secrets;
};

export const useGetProjectSecrets = ({
  projectId,
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
    enabled: Boolean(projectId && environment) && (options?.enabled ?? true),
    queryKey: secretKeys.getProjectSecret({
      projectId,
      environment,
      secretPath,
      viewSecretValue
    }),
    queryFn: () => fetchProjectSecrets({ projectId, environment, secretPath, viewSecretValue }),
    select: useCallback(
      (data: Awaited<ReturnType<typeof fetchProjectSecrets>>) => mergePersonalSecrets(data.secrets),
      []
    )
  });

export const useGetProjectSecretsAllEnv = ({
  projectId,
  envs,
  secretPath
}: TGetProjectSecretsAllEnvDTO) => {
  const [isErrorHandled, setIsErrorHandled] = useToggle(false);

  const secrets = useQueries({
    queries: envs.map((environment) => ({
      queryKey: secretKeys.getProjectSecret({
        projectId,
        environment,
        secretPath
      }),
      enabled: Boolean(projectId && environment),
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
      queryFn: () => fetchProjectSecrets({ projectId, environment, secretPath }),
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
    `/api/v1/dashboard/secret-versions/${secretId}`,
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

export const fetchSecretVersionValue = async (secretId: string, version: number) => {
  const { data } = await apiRequest.get<TSecretVersionValue>(
    `/api/v1/dashboard/secret-versions/${secretId}/value/${version}`
  );
  return data.value;
};

export const useGetSecretVersionValue = (
  dto: TGetSecretVersionValue,
  options?: Omit<
    UseQueryOptions<string, unknown, string, ReturnType<typeof secretKeys.getSecretVersionValue>>,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: secretKeys.getSecretVersionValue(dto.secretId, dto.version),
    queryFn: () => fetchSecretVersionValue(dto.secretId, dto.version),
    ...options
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
          projectId: dto.projectId,
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
    `/api/v4/secrets/${secretKey}/secret-reference-tree`,
    {
      params: {
        secretPath,
        projectId,
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

export const fetchSecretReferences = async (dto: TGetSecretReferencesDTO) => {
  const { data } = await apiRequest.get<{
    tree: TSecretDependencyTreeNode;
  }>(`/api/v4/secrets/${encodeURIComponent(dto.secretKey)}/reference-dependency-tree`, {
    params: {
      projectId: dto.projectId,
      secretPath: dto.secretPath,
      environment: dto.environment
    }
  });
  return data;
};

export const useGetSecretReferences = (
  dto: TGetSecretReferencesDTO,
  options?: { enabled?: boolean }
) =>
  useQuery({
    enabled:
      (options?.enabled ?? true) &&
      Boolean(dto.environment) &&
      Boolean(dto.secretPath) &&
      Boolean(dto.projectId) &&
      Boolean(dto.secretKey),
    queryKey: secretKeys.getSecretReferences(dto),
    queryFn: () => fetchSecretReferences(dto)
  });
