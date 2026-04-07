/* eslint-disable no-nested-ternary */
import React, { useMemo } from "react";
import { AlertTriangleIcon, ImportIcon, KeyIcon, RefreshCwIcon } from "lucide-react";

import {
  UnstableAlert,
  UnstableAlertTitle,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
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
  tooltipText?: string;
  destination?: string;
  syncName?: string;
}

interface CollapsibleSecretImportsProps {
  importedBy?: {
    environment: { name: string; slug: string };
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

  const projectBase = `/organizations/${currentOrg.id}/projects/secret-management/${currentProject.id}`;

  const truncatePath = (path: string, maxLength = 54): string => {
    if (path.length <= maxLength) return path;

    const endPortion = path.slice(-(maxLength - 3));
    const slashIndex = endPortion.indexOf("/");

    if (slashIndex !== -1) {
      return `...${endPortion.slice(slashIndex)}`;
    }

    return `...${endPortion}`;
  };

  const handlePathClick = (item: FlatItem) => {
    if (item.type === ItemType.SecretSync) {
      window.open(
        `${projectBase}/integrations/secret-syncs/${item.destination}/${item.id}`,
        "_blank",
        "noopener,noreferrer"
      );
      return;
    }

    const params = new URLSearchParams();
    params.set("environments", JSON.stringify([item.environment.slug]));

    if (item.type === ItemType.Folder) {
      // Import: navigate to the folder path, filter to imports
      params.set("secretPath", item.path);
      params.set("filterBy", "import");
    } else {
      // Secret reference: navigate to the folder containing the secret, search for the key
      const segments = item.path.split("/").filter(Boolean);
      const keyName = segments.pop() || "";
      const folderPath = segments.length > 0 ? `/${segments.join("/")}` : "/";
      params.set("secretPath", folderPath);
      params.set("filterBy", "secret");
      if (keyName) {
        params.set("search", keyName);
      }
    }

    window.open(`${projectBase}/overview?${params.toString()}`, "_blank");
  };

  const flattenedItems = useMemo(() => {
    const items: FlatItem[] = [];

    importedBy.forEach((env) => {
      env.folders.forEach((folder) => {
        if (folder.isImported && !onlyReferences) {
          items.push({
            type: ItemType.Folder,
            path: folder.name,
            id: `folder-${env.environment.name}-${folder.name}`,
            reference: "Imported",
            environment: env.environment
          });
        }

        if (folder.secrets?.length) {
          folder.secrets.forEach(({ secretId: secret, referencedSecretKey }) => {
            const secretPath = folder.name === "/" ? `/${secret}` : `${folder.name}/${secret}`;
            if (
              secretsToDelete.includes(referencedSecretKey) &&
              !items.some(
                (item) => item.environment.name === env.environment.name && item.path === secretPath
              )
            ) {
              items.push({
                type: ItemType.Secret,
                path: secretPath,
                secretKey: referencedSecretKey,
                id: `secret-${env.environment.name}-${secretPath}`,
                reference: "Referenced",
                environment: env.environment
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

  return (
    <div className="mb-4 w-full">
      <UnstableAlert className="mb-4" variant="warning">
        <AlertTriangleIcon className="size-4" />
        <UnstableAlertTitle>
          The following resources will be affected by this change
        </UnstableAlertTitle>
      </UnstableAlert>

      <UnstableTable containerClassName="max-h-64 overflow-y-auto">
        <UnstableTableHeader className="sticky -top-px z-10 bg-container [&_tr]:border-b-0">
          <UnstableTableRow>
            <UnstableTableHead className="w-1/4 border-r border-b-0 shadow-[inset_0_-1px_0_var(--color-border)]">
              Resource
            </UnstableTableHead>
            <UnstableTableHead className="w-1/3 border-r border-b-0 shadow-[inset_0_-1px_0_var(--color-border)]">
              Environment
            </UnstableTableHead>
            <UnstableTableHead className="w-1/3 border-b-0 shadow-[inset_0_-1px_0_var(--color-border)]">
              Path
            </UnstableTableHead>
          </UnstableTableRow>
        </UnstableTableHeader>
        <UnstableTableBody>
          {flattenedItems.map((item) => (
            <UnstableTableRow
              key={item.id}
              onClick={() => handlePathClick(item)}
              title={
                item.type === ItemType.SecretSync
                  ? "Navigate to Secret Sync"
                  : `Navigate to ${item.path}`
              }
            >
              <UnstableTableCell className="border-r" isTruncatable>
                {getResourceLabel(item)}
              </UnstableTableCell>
              <UnstableTableCell isTruncatable className="border-r">
                {item.environment.name}
              </UnstableTableCell>
              <UnstableTableCell isTruncatable>{truncatePath(item.path)}</UnstableTableCell>
            </UnstableTableRow>
          ))}
        </UnstableTableBody>
      </UnstableTable>
    </div>
  );
};
