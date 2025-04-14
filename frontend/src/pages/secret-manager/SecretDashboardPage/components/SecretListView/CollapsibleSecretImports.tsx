import React, { useMemo } from "react";
import { faFileImport, faKey, faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Table, TBody, Td, Th, THead, Tr } from "@app/components/v2";
import { useWorkspace } from "@app/context";

enum ItemType {
  Folder = "Folder",
  Secret = "Secret"
}

interface FlatItem {
  type: ItemType;
  path: string;
  secretKey?: string;
  reference: string;
  id: string;
  environment: { name: string; slug: string };
}

interface CollapsibleSecretImportsProps {
  importedBy?: {
    environment: { name: string; slug: string };
    folders: {
      name: string;
      secrets?: { secretId: string; referencedSecretKey: string }[];
      isImported: boolean;
    }[];
  }[];
  secretsToDelete: string[];
}

export const CollapsibleSecretImports: React.FC<CollapsibleSecretImportsProps> = ({
  importedBy = [],
  secretsToDelete
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
        if (folder.isImported) {
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

    return items.sort((a, b) => {
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
  }, [importedBy]);

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

  if (!hasImportedItems) {
    return null;
  }

  return (
    <div className="mb-4 w-full">
      <div className="mb-4 rounded-md border border-red-700/30 bg-red-900/20">
        <div className="flex items-start gap-3 p-4">
          <div className="mt-0.5 flex-shrink-0 text-red-500">
            <FontAwesomeIcon icon={faWarning} className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="w-full">
            <p className="text-sm font-semibold text-red-500">
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
                title={`Navigate to ${item.path}`}
              >
                <Td>
                  <FontAwesomeIcon
                    icon={item.type === ItemType.Secret ? faKey : faFileImport}
                    className={`h-4 w-4 ${item.type === ItemType.Secret ? "text-gray-400" : "text-green-700"}`}
                    aria-hidden="true"
                  />
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
