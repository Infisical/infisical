/* eslint-disable no-nested-ternary */
import React, { useMemo } from "react";
import { faFileImport, faKey, faSync, faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Table, TBody, Td, Th, THead, Tooltip, Tr } from "@app/components/v2";
import { useWorkspace } from "@app/context";
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

export const CollapsibleSecretImports: React.FC<CollapsibleSecretImportsProps> = ({
  importedBy = [],
  usedBySecretSyncs = [],
  secretsToDelete,
  onlyReferences
}) => {
  const { currentWorkspace } = useWorkspace();

  const truncatePath = (path: string, maxLength = 24): string => {
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
        `/secret-manager/${currentWorkspace.id}/integrations/secret-syncs/${item.destination}/${item.id}`,
        "_blank",
        "noopener,noreferrer"
      );
      return;
    }

    let pathToNavigate;
    if (item.type === ItemType.Folder) {
      pathToNavigate = item.path;
    } else {
      const lastSlashIndex = item.path.lastIndexOf("/");
      pathToNavigate = lastSlashIndex > 0 ? item.path.substring(0, lastSlashIndex) : "/";
    }
    const encodedPath = encodeURIComponent(pathToNavigate);
    window.open(
      `/secret-manager/${currentWorkspace.id}/secrets/${item.environment.slug}?secretPath=${encodedPath}`,
      "_blank"
    );
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
        tooltipText: `Currently used by Secret Sync: ${syncItem.name}`
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

  const alertColors = onlyReferences
    ? {
        border: "border-yellow-700/30",
        bg: "bg-yellow-900/20",
        text: "text-yellow-500"
      }
    : {
        border: "border-red-700/30",
        bg: "bg-red-900/20",
        text: "text-red-500"
      };

  return (
    <div className="mb-4 w-full">
      <div className={`mb-4 rounded-md border ${alertColors.border} ${alertColors.bg}`}>
        <div className="flex items-start gap-3 p-4">
          <div className={`mt-0.5 flex-shrink-0 ${alertColors.text}`}>
            <FontAwesomeIcon icon={faWarning} className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="w-full">
            <p className={`text-sm font-semibold ${alertColors.text}`}>
              The following resources will be affected by this change
            </p>
          </div>
        </div>
      </div>

      <div className="max-h-64 overflow-y-auto rounded-md border border-mineshaft-700">
        <Table>
          <THead className="sticky -top-1 bg-bunker-800">
            <Th className="px-4">Type</Th>
            <Th className="px-4">Environment</Th>
            <Th className="truncate px-4">Path</Th>
            <Th className="px-4">Usage</Th>
          </THead>
          <TBody>
            {flattenedItems.map((item) => (
              <Tr
                key={item.id}
                onClick={() => handlePathClick(item)}
                className="cursor-pointer hover:bg-mineshaft-700"
                title={
                  item.type === ItemType.SecretSync
                    ? "Navigate to Secret Sync"
                    : `Navigate to ${item.path}`
                }
              >
                <Td>
                  <Tooltip
                    className="max-w-md"
                    content={item.tooltipText}
                    isDisabled={!item.tooltipText}
                  >
                    <FontAwesomeIcon
                      icon={
                        item.type === ItemType.Secret
                          ? faKey
                          : item.type === ItemType.Folder
                            ? faFileImport
                            : faSync
                      }
                      className={`h-4 w-4 ${
                        item.type === ItemType.Secret
                          ? "text-gray-400"
                          : item.type === ItemType.Folder
                            ? "text-green-700"
                            : "text-mineshaft-300"
                      }`}
                      aria-hidden="true"
                    />
                  </Tooltip>
                </Td>
                <Td className="px-4">{item.environment.name}</Td>
                <Td className="truncate px-4">{truncatePath(item.path)}</Td>
                <Td className="px-4">{item.reference}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
};
