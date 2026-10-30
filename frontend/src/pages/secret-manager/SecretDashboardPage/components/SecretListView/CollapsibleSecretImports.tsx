import React, { useMemo } from "react";
import { AlertTriangleIcon, ImportIcon, KeyIcon, RefreshCwIcon } from "lucide-react";

import {
  Alert,
  AlertTitle,
  RowLink,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useOrganization, useProject } from "@app/context";
import { UsedBySecretSyncs } from "@app/hooks/api/dashboard/types";

enum ItemType {
  Folder = "Folder",
  Secret = "Secret",
  SecretSync = "SecretSync"
}

interface FlatItem {
  type: ItemType;
  path: string;
  secretKey?: string;
  reference: string;
  id: string;
  environment: { name: string; slug: string };
  projectName?: string;
  sourceProjectId?: string;
  tooltipText?: string;
  destination?: string;
  syncName?: string;
}

interface CollapsibleSecretImportsProps {
  importedBy?: {
    environment: { name: string; slug: string };
    project?: { name: string; slug: string; id: string };
    folders: {
      name: string;
      secrets?: { secretId: string; referencedSecretKey: string; referencedSecretEnv: string }[];
      isImported: boolean;
    }[];
  }[];
  usedBySecretSyncs?: UsedBySecretSyncs[] | null;
  secretsToDelete: string[];
  onlyReferences?: boolean;
}

const getResourceLabel = (item: FlatItem) => {
  switch (item.type) {
    case ItemType.Secret:
      return (
        <>
          <KeyIcon className="mr-2 mb-0.5 inline-block size-4 shrink-0 text-secret" />
          Secret Reference
        </>
      );
    case ItemType.Folder:
      return (
        <>
          <ImportIcon className="mr-2 mb-0.5 inline-block size-4 shrink-0 text-import" />
          Secret Import
        </>
      );
    case ItemType.SecretSync:
      return (
        <>
          <RefreshCwIcon className="mr-2 mb-0.5 inline-block size-4 shrink-0 text-secret-rotation" />
          Secret Sync{item.syncName && `: ${item.syncName}`}
        </>
      );
    default:
      return null;
  }
};

export const CollapsibleSecretImports: React.FC<CollapsibleSecretImportsProps> = ({
  importedBy = [],
  usedBySecretSyncs = [],
  secretsToDelete,
  onlyReferences
}) => {
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();

  const truncatePath = (path: string, maxLength = 54): string => {
    if (path.length <= maxLength) return path;

    const endPortion = path.slice(-(maxLength - 3));
    const slashIndex = endPortion.indexOf("/");

    if (slashIndex !== -1) {
      return `...${endPortion.slice(slashIndex)}`;
    }

    return `...${endPortion}`;
  };

  const getItemLink = (item: FlatItem) => {
    if (item.type === ItemType.SecretSync) {
      return {
        to: ROUTE_PATHS.SecretManager.SecretSyncDetailsByIDPage.path,
        params: {
          orgId: currentOrg.id,
          projectId: currentProject.id,
          destination: item.destination ?? "",
          syncId: item.id
        }
      } as const;
    }

    const params = {
      orgId: currentOrg.id,
      projectId: item.sourceProjectId ?? currentProject.id
    };
    const environments = [item.environment.slug];

    if (item.type === ItemType.Folder) {
      // Import: navigate to the folder path, filter to imports
      return {
        to: "/organizations/$orgId/projects/secret-management/$projectId/overview",
        params,
        search: { environments, secretPath: item.path, filterBy: "import" }
      } as const;
    }

    // Secret reference: navigate to the folder containing the secret, search for the key
    const segments = item.path.split("/").filter(Boolean);
    const keyName = segments.pop() || "";
    const folderPath = segments.length > 0 ? `/${segments.join("/")}` : "/";
    return {
      to: "/organizations/$orgId/projects/secret-management/$projectId/overview",
      params,
      search: {
        environments,
        secretPath: folderPath,
        filterBy: "secret",
        ...(keyName && { search: keyName })
      }
    } as const;
  };

  const flattenedItems = useMemo(() => {
    const items: FlatItem[] = [];

    importedBy.forEach((env) => {
      env.folders.forEach((folder) => {
        if (folder.isImported && !onlyReferences) {
          items.push({
            type: ItemType.Folder,
            path: folder.name,
            id: `folder-${env.project?.id ?? ""}-${env.environment.name}-${folder.name}`,
            reference: "Imported",
            environment: env.environment,
            projectName: env.project?.name,
            sourceProjectId: env.project?.id
          });
        }

        if (folder.secrets?.length) {
          folder.secrets.forEach(({ secretId: secret, referencedSecretKey }) => {
            const secretPath = folder.name === "/" ? `/${secret}` : `${folder.name}/${secret}`;
            if (
              secretsToDelete.includes(referencedSecretKey) &&
              !items.some(
                (item) =>
                  item.environment.name === env.environment.name &&
                  item.path === secretPath &&
                  item.sourceProjectId === env.project?.id
              )
            ) {
              items.push({
                type: ItemType.Secret,
                path: secretPath,
                secretKey: referencedSecretKey,
                id: `secret-${env.project?.id ?? ""}-${env.environment.name}-${secretPath}`,
                reference: "Referenced",
                environment: env.environment,
                projectName: env.project?.name,
                sourceProjectId: env.project?.id
              });
            }
          });
        }
      });
    });

    // Add secret sync items
    usedBySecretSyncs?.forEach((syncItem) => {
      items.push({
        type: ItemType.SecretSync,
        destination: syncItem.destination,
        path: syncItem.path,
        id: syncItem.id,
        reference: "Secret Sync",
        environment: { name: syncItem.environment, slug: "" },
        syncName: syncItem.name
      });
    });

    return items.sort((a, b) => {
      if (a.type === ItemType.SecretSync && b.type !== ItemType.SecretSync) return 1;
      if (a.type !== ItemType.SecretSync && b.type === ItemType.SecretSync) return -1;

      if (a.type === ItemType.SecretSync && b.type === ItemType.SecretSync) {
        return a.path.localeCompare(b.path);
      }
      const envCompare = a.environment.name.localeCompare(b.environment.name);
      if (envCompare !== 0) return envCompare;

      const aPath = a.path.startsWith("/") ? a.path : `/${a.path}`;
      const bPath = b.path.startsWith("/") ? b.path : `/${b.path}`;

      const aSegments = aPath.split("/").filter(Boolean).length;
      const bSegments = bPath.split("/").filter(Boolean).length;

      if (aSegments !== bSegments) {
        return aSegments - bSegments;
      }

      return aPath.localeCompare(bPath);
    });
  }, [importedBy, usedBySecretSyncs, secretsToDelete, onlyReferences]);

  const hasImportedItems = importedBy.some((element) => {
    if (element.folders && element.folders.length > 0) {
      return element.folders.some(
        (folder) =>
          folder.isImported ||
          (folder.secrets &&
            folder.secrets.length > 0 &&
            folder.secrets.some((secret) => secretsToDelete.includes(secret.referencedSecretKey)))
      );
    }

    return false;
  });

  const hasSecretSyncItems = usedBySecretSyncs && usedBySecretSyncs.length > 0;

  if (!hasImportedItems && !hasSecretSyncItems) {
    return null;
  }

  const hasCrossProjectItems = flattenedItems.some((item) => item.projectName !== undefined);

  return (
    <div className="mb-4 w-full">
      <Alert className="mb-4" variant="warning">
        <AlertTriangleIcon className="size-4" />
        <AlertTitle>The following resources will be affected by this change</AlertTitle>
      </Alert>

      <Table containerClassName="max-h-64 overflow-y-auto">
        <TableHeader className="sticky -top-px z-10 bg-container [&_tr]:border-b-0">
          <TableRow>
            <TableHead className="w-1/4 border-r border-b-0 shadow-[inset_0_-1px_0_var(--color-border)]">
              Resource
            </TableHead>
            {hasCrossProjectItems && (
              <TableHead className="w-1/4 border-r border-b-0 shadow-[inset_0_-1px_0_var(--color-border)]">
                Project
              </TableHead>
            )}
            <TableHead className="w-1/3 border-r border-b-0 shadow-[inset_0_-1px_0_var(--color-border)]">
              Environment
            </TableHead>
            <TableHead className="w-1/3 border-b-0 shadow-[inset_0_-1px_0_var(--color-border)]">
              Path
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {flattenedItems.map((item) => (
            <TableRow
              key={item.id}
              linked
              title={
                item.type === ItemType.SecretSync
                  ? "Navigate to Secret Sync"
                  : `Navigate to ${item.path}`
              }
            >
              <TableCell className="border-r" isTruncatable>
                <RowLink {...getItemLink(item)} target="_blank" rel="noopener noreferrer">
                  {getResourceLabel(item)}
                </RowLink>
              </TableCell>
              {hasCrossProjectItems && (
                <TableCell isTruncatable className="border-r">
                  {item.projectName ?? "-"}
                </TableCell>
              )}
              <TableCell isTruncatable className="border-r">
                {item.environment.name}
              </TableCell>
              <TableCell isTruncatable>{truncatePath(item.path)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
