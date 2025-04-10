import React, { useMemo } from "react";
import { faFileImport, faKey, faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Table, TBody, Td, Th, THead, Tr } from "@app/components/v2";
import { useWorkspace } from "@app/context";

interface FlatItem {
  type: "folder" | "secret";
  path: string;
  secretKey?: string;
  reference: string;
  id: string;
  envName: string;
  envSlug: string;
}

interface CollapsibleSecretImportsProps {
  importedBy?: {
    envName: string;
    envSlug: string;
    folders: { folderName: string; secrets?: string[]; folderImported: boolean }[];
  }[];
}

export const CollapsibleSecretImports: React.FC<CollapsibleSecretImportsProps> = ({
  importedBy = []
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
    if (item.type === "folder") {
      pathToNavigate = item.path;
    } else {
      const lastSlashIndex = item.path.lastIndexOf("/");
      pathToNavigate = lastSlashIndex > 0 ? item.path.substring(0, lastSlashIndex) : "/";
    }
    const encodedPath = encodeURIComponent(pathToNavigate);
    window.open(
      `/secret-manager/${currentWorkspace.id}/secrets/${item.envSlug}?secretPath=${encodedPath}`,
      "_blank"
    );
  };

  const flattenedItems = useMemo(() => {
    const items: FlatItem[] = [];

    importedBy.forEach((env) => {
      env.folders.forEach((folder) => {
        if (folder.folderImported) {
          items.push({
            type: "folder",
            path: folder.folderName,
            id: `folder-${env.envName}-${folder.folderName}`,
            reference: "Imported",
            envName: env.envName,
            envSlug: env.envSlug
          });
        }

        if (folder.secrets?.length) {
          folder.secrets.forEach((secret) => {
            const secretPath =
              folder.folderName === "/" ? `/${secret}` : `${folder.folderName}/${secret}`;

            items.push({
              type: "secret",
              path: secretPath,
              secretKey: secret,
              id: `secret-${env.envName}-${secretPath}`,
              reference: "Referenced",
              envName: env.envName,
              envSlug: env.envSlug
            });
          });
        }
      });
    });

    return items.sort((a, b) => {
      const envCompare = a.envName.localeCompare(b.envName);
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
                    icon={item.type === "secret" ? faKey : faFileImport}
                    className={`h-4 w-4 ${item.type === "secret" ? "text-gray-400" : "text-green-700"}`}
                    aria-hidden="true"
                  />
                </Td>
                <Td className="px-4">{item.envName}</Td>
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
