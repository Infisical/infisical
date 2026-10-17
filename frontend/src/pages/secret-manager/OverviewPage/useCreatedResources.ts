import { useCallback, useEffect, useRef, useState } from "react";
import { MutationKey, useQueryClient } from "@tanstack/react-query";

import { createdResourceMutationKeys } from "@app/hooks/api/dashboard/queries";
import { DashboardProjectSecretsOverview } from "@app/hooks/api/dashboard/types";
import { TCreateDynamicSecretDTO } from "@app/hooks/api/dynamicSecret/types";
import { TCreateHoneyTokenDTO } from "@app/hooks/api/honeyTokens/types";
import { TCreateProxiedServiceDTO } from "@app/hooks/api/proxiedServices/types";
import { PendingAction, TCreateFolderDTO } from "@app/hooks/api/secretFolders/types";
import { TCreateSecretImportDTO } from "@app/hooks/api/secretImports/types";
import { TCreateSecretRotationV2DTO } from "@app/hooks/api/secretRotationsV2/types";
import { TCreateSecretBatchDTO, TCreateSecretsV3DTO } from "@app/hooks/api/secrets/types";
import { SecretType } from "@app/hooks/api/types";
import { PendingChanges } from "@app/pages/secret-manager/SecretDashboardPage/SecretMainPage.store";

export enum CreatedResourceType {
  Secret = "secret",
  Folder = "folder",
  SecretImport = "secret-import",
  DynamicSecret = "dynamic-secret",
  SecretRotation = "secret-rotation",
  HoneyToken = "honey-token",
  ProxiedService = "proxied-service"
}

export type CreatedResources = Partial<Record<CreatedResourceType, string[]>>;

type CreateEvent = {
  projectId?: string;
  projectSlug?: string;
  secretPath?: string;
  environment: string;
  created: CreatedResources;
};

export const getSecretImportRowName = (importEnvSlug: string, importPath: string) =>
  `${importEnvSlug}:${importPath}`;

export const getOverviewRowNames = (
  overview: DashboardProjectSecretsOverview | undefined,
  type: CreatedResourceType
): string[] => {
  switch (type) {
    case CreatedResourceType.Secret:
      return overview?.secrets?.map((secret) => secret.key) ?? [];
    case CreatedResourceType.Folder:
      return overview?.folders?.map((folder) => folder.name) ?? [];
    case CreatedResourceType.SecretImport:
      return (
        overview?.imports?.map((secretImport) =>
          getSecretImportRowName(secretImport.importEnv.slug, secretImport.importPath)
        ) ?? []
      );
    case CreatedResourceType.DynamicSecret:
      return overview?.dynamicSecrets?.map((dynamicSecret) => dynamicSecret.name) ?? [];
    case CreatedResourceType.SecretRotation:
      return overview?.secretRotations?.map((secretRotation) => secretRotation.name) ?? [];
    case CreatedResourceType.HoneyToken:
      return overview?.honeyTokens?.map((honeyToken) => honeyToken.name) ?? [];
    case CreatedResourceType.ProxiedService:
      return overview?.proxiedServices?.map((proxiedService) => proxiedService.name) ?? [];
    default:
      return [];
  }
};

const normalizePath = (path = "/") => (path.length > 1 ? path.replace(/\/+$/, "") : path);

const getCreateEvent = (mutationKey: MutationKey | undefined, variables: unknown) => {
  if (!mutationKey || mutationKey[0] !== createdResourceMutationKeys.secret[0] || !variables)
    return undefined;

  switch (mutationKey[1]) {
    case createdResourceMutationKeys.secret[1]: {
      const dto = variables as TCreateSecretsV3DTO;
      if (dto.type === SecretType.Personal) return undefined;
      return {
        projectId: dto.projectId,
        secretPath: dto.secretPath,
        environment: dto.environment,
        created: { [CreatedResourceType.Secret]: [dto.secretKey] }
      };
    }
    case createdResourceMutationKeys.secretBatch[1]: {
      const dto = variables as TCreateSecretBatchDTO;
      return {
        projectId: dto.projectId,
        secretPath: dto.secretPath,
        environment: dto.environment,
        created: {
          [CreatedResourceType.Secret]: dto.secrets
            .filter((secret) => secret.type !== SecretType.Personal)
            .map((secret) => secret.secretKey)
        }
      };
    }
    case createdResourceMutationKeys.commit[1]: {
      const dto = variables as {
        projectId: string;
        environment: string;
        secretPath: string;
        pendingChanges: PendingChanges;
      };
      return {
        projectId: dto.projectId,
        secretPath: dto.secretPath,
        environment: dto.environment,
        created: {
          [CreatedResourceType.Secret]: dto.pendingChanges.secrets.flatMap((change) =>
            change.type === PendingAction.Create ? [change.secretKey] : []
          ),
          [CreatedResourceType.Folder]: dto.pendingChanges.folders.flatMap((change) =>
            change.type === PendingAction.Create ? [change.folderName] : []
          )
        }
      };
    }
    case createdResourceMutationKeys.folder[1]: {
      const dto = variables as TCreateFolderDTO;
      return {
        projectId: dto.projectId,
        secretPath: dto.path,
        environment: dto.environment,
        created: { [CreatedResourceType.Folder]: [dto.name] }
      };
    }
    case createdResourceMutationKeys.secretImport[1]: {
      const dto = variables as TCreateSecretImportDTO;
      return {
        projectId: dto.projectId,
        secretPath: dto.path,
        environment: dto.environment,
        created: {
          [CreatedResourceType.SecretImport]: [
            getSecretImportRowName(dto.import.environment, dto.import.path)
          ]
        }
      };
    }
    case createdResourceMutationKeys.dynamicSecret[1]: {
      const dto = variables as TCreateDynamicSecretDTO;
      return {
        projectSlug: dto.projectSlug,
        secretPath: dto.path,
        environment: dto.environmentSlug,
        created: { [CreatedResourceType.DynamicSecret]: [dto.name] }
      };
    }
    case createdResourceMutationKeys.secretRotation[1]: {
      const dto = variables as TCreateSecretRotationV2DTO;
      return {
        projectId: dto.projectId,
        secretPath: dto.secretPath,
        environment: dto.environment,
        created: { [CreatedResourceType.SecretRotation]: [dto.name] }
      };
    }
    case createdResourceMutationKeys.honeyToken[1]: {
      const dto = variables as TCreateHoneyTokenDTO;
      return {
        projectId: dto.projectId,
        secretPath: dto.secretPath,
        environment: dto.environment,
        created: { [CreatedResourceType.HoneyToken]: [dto.name] }
      };
    }
    case createdResourceMutationKeys.proxiedService[1]: {
      const dto = variables as TCreateProxiedServiceDTO;
      return {
        projectId: dto.projectId,
        secretPath: dto.secretPath,
        environment: dto.environment,
        created: { [CreatedResourceType.ProxiedService]: [dto.name] }
      };
    }
    default:
      return undefined;
  }
};

const mergeNewestFirst = (current: CreatedResources, created: CreatedResources) => {
  const next = { ...current };
  (Object.entries(created) as [CreatedResourceType, string[]][]).forEach(([type, names]) => {
    if (!names.length) return;
    next[type] = [...names, ...(current[type] ?? []).filter((name) => !names.includes(name))];
  });
  return next;
};

const hasAny = (resources: CreatedResources) =>
  Object.values(resources).some((names) => names.length > 0);

// Listens for every create mutation that lands in the folder being viewed, whichever flow fired it
// (create sheets, quick add, uploads, batch commits), and tracks the new rows so the overview can
// pin them to the top, badge them, and flash them once they render. Resources that were already
// listed when they were created (a secret added to a missing environment cell) are only flashed.
export const useCreatedResources = ({
  projectId,
  projectSlug,
  secretPath,
  isListed
}: {
  projectId: string;
  projectSlug: string;
  secretPath: string;
  isListed: (type: CreatedResourceType, name: string) => boolean;
}) => {
  const queryClient = useQueryClient();
  const [pinned, setPinned] = useState<CreatedResources>({});
  const [highlighted, setHighlighted] = useState<CreatedResources>({});
  const [pinnedSecretEnvironment, setPinnedSecretEnvironment] = useState<string>();
  const isListedRef = useRef(isListed);
  isListedRef.current = isListed;
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setPinned({});
    setHighlighted({});
    setPinnedSecretEnvironment(undefined);
  }, [projectId, secretPath]);

  useEffect(
    () =>
      queryClient.getMutationCache().subscribe((event) => {
        if (event.type !== "updated" || event.action.type !== "success") return;
        const createEvent: CreateEvent | undefined = getCreateEvent(
          event.mutation.options.mutationKey,
          event.mutation.state.variables
        );
        if (!createEvent || !hasAny(createEvent.created)) return;
        if (createEvent.projectId && createEvent.projectId !== projectId) return;
        if (createEvent.projectSlug && createEvent.projectSlug !== projectSlug) return;
        if (normalizePath(createEvent.secretPath) !== normalizePath(secretPath)) return;

        const unlisted = Object.fromEntries(
          (Object.entries(createEvent.created) as [CreatedResourceType, string[]][]).map(
            ([type, names]) => [type, names.filter((name) => !isListedRef.current(type, name))]
          )
        ) as CreatedResources;

        clearTimeout(highlightTimerRef.current);
        highlightTimerRef.current = undefined;
        setHighlighted((prev) => mergeNewestFirst(prev, createEvent.created));
        setPinned((prev) => mergeNewestFirst(prev, unlisted));
        if (unlisted[CreatedResourceType.Secret]?.length) {
          setPinnedSecretEnvironment(createEvent.environment);
        }
      }),
    [queryClient, projectId, projectSlug, secretPath]
  );

  // New rows render only after the overview refetches, so scroll to the first one and start the
  // fade from that point rather than from when the mutation resolved.
  const hasHighlights = hasAny(highlighted);
  useEffect(() => {
    if (!hasHighlights || highlightTimerRef.current) return;
    const row = document.querySelector("tr.row-highlight");
    if (!row) return;
    row.scrollIntoView({ block: "nearest", behavior: "smooth" });
    highlightTimerRef.current = setTimeout(() => {
      highlightTimerRef.current = undefined;
      setHighlighted({});
    }, 2500);
  });

  useEffect(() => () => clearTimeout(highlightTimerRef.current), []);

  const isPinned = useCallback(
    (type: CreatedResourceType, name: string) => Boolean(pinned[type]?.includes(name)),
    [pinned]
  );
  const isHighlighted = useCallback(
    (type: CreatedResourceType, name: string) => Boolean(highlighted[type]?.includes(name)),
    [highlighted]
  );

  return { pinned, pinnedSecretEnvironment, isPinned, isHighlighted };
};

// Moves the pinned rows (fetched separately, so they show regardless of the active page or sort)
// ahead of the page rows, newest first.
export const pinCreatedFirst = <T>(
  pageItems: T[] | undefined,
  pinnedItems: T[] | undefined,
  pinnedNames: string[] | undefined,
  getName: (item: T) => string
) => {
  if (!pinnedNames?.length || !pinnedItems?.length) return pageItems;
  const matches = pinnedItems
    .filter((item) => pinnedNames.includes(getName(item)))
    .sort((a, b) => pinnedNames.indexOf(getName(a)) - pinnedNames.indexOf(getName(b)));
  if (!matches.length) return pageItems;
  const matchedNames = new Set(matches.map(getName));
  return [...matches, ...(pageItems ?? []).filter((item) => !matchedNames.has(getName(item)))];
};
