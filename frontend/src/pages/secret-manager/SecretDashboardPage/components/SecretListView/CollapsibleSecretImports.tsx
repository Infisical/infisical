import React, { useMemo, useState } from "react";
import {
  faChevronLeft,
  faChevronRight,
  faFolder,
  faKey,
  faWarning
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface FlatItem {
  type: "folder" | "secret";
  path: string;
  secretKey?: string;
  reference: string;
  id: string;
}

interface CollapsibleSecretImportsProps {
  importedBy?: {
    envName: string;
    folders: { folderName: string; secrets?: string[]; folderImported: boolean }[];
  }[];
}

export const CollapsibleSecretImports: React.FC<CollapsibleSecretImportsProps> = ({
  importedBy = []
}) => {
  const [currentEnvIndex, setCurrentEnvIndex] = useState(0);

  const truncatePath = (path: string, maxLength = 45): string =>
    path.length <= maxLength ? path : `...${path.slice(-(maxLength - 3))}`;

  const groupedItems = useMemo(() => {
    return importedBy.map((env) => {
      const envItems: FlatItem[] = [];

      env.folders.forEach((folder) => {
        if (folder.folderImported) {
          envItems.push({
            type: "folder",
            path: folder.folderName,
            id: `folder-${env.envName}-${folder.folderName}`,
            reference: "Imported"
          });
        }

        if (folder.secrets?.length) {
          folder.secrets.forEach((secret) => {
            const secretPath =
              folder.folderName === "/" ? `/${secret}` : `${folder.folderName}/${secret}`;

            envItems.push({
              type: "secret",
              path: secretPath,
              secretKey: secret,
              id: `secret-${env.envName}-${secretPath}`,
              reference: "Referenced"
            });
          });
        }
      });

      return {
        envName: env.envName,
        items: envItems.sort((a, b) => {
          const aPath = a.path.startsWith("/") ? a.path : `/${a.path}`;
          const bPath = b.path.startsWith("/") ? b.path : `/${b.path}`;

          const aSegments = aPath.split("/").filter(Boolean).length;
          const bSegments = bPath.split("/").filter(Boolean).length;

          if (aSegments !== bSegments) {
            return aSegments - bSegments;
          }

          return aPath.localeCompare(bPath);
        })
      };
    });
  }, [importedBy]);

  const totalEnvironments = groupedItems.length;
  const currentItems = totalEnvironments > 0 ? groupedItems[currentEnvIndex]?.items || [] : [];

  const handlePrevEnvironment = () => {
    if (currentEnvIndex > 0) {
      setCurrentEnvIndex(currentEnvIndex - 1);
    }
  };

  const handleNextEnvironment = () => {
    if (currentEnvIndex < totalEnvironments - 1) {
      setCurrentEnvIndex(currentEnvIndex + 1);
    }
  };

  const renderPaginationButton = (
    direction: "prev" | "next",
    onClick: () => void,
    disabled: boolean
  ) => {
    const icon = direction === "prev" ? faChevronLeft : faChevronRight;
    const label = direction === "prev" ? "Previous environment" : "Next environment";

    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`rounded-md border p-2 ${
          disabled
            ? "border-mineshaft-700 text-gray-600"
            : "border-mineshaft-600 text-gray-400 hover:bg-mineshaft-800"
        }`}
        aria-label={label}
      >
        <FontAwesomeIcon icon={icon} className="h-4 w-4" aria-hidden="true" />
      </button>
    );
  };

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-mineshaft-600 bg-mineshaft-900 shadow-lg">
      <div className="p-4">
        <div className="mb-4 rounded-md border border-red-700/30 bg-red-900/20">
          <div className="flex items-start gap-3 p-4">
            <div className="mt-0.5 flex-shrink-0 text-red-500">
              <FontAwesomeIcon icon={faWarning} className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="w-full">
              <p className="text-sm font-semibold text-red-500">
                Warning: The following resources will be affected by this change
              </p>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-xs text-gray-300">
                <li>Deleting will remove it from all folders where it&apos;s imported</li>
                <li>
                  Any secrets referencing this will display their reference syntax (like{" "}
                  <code className="rounded px-1 py-0.5 font-mono text-red-500">
                    {"{env.secretPath.key}"}
                  </code>
                  ) instead of actual values
                </li>
                <li>Secrets referencing this will not be automatically deleted</li>
              </ul>
            </div>
          </div>
        </div>

        {totalEnvironments > 0 && (
          <div className="mb-2 px-1">
            <h3 className="text-md font-medium text-gray-200">
              Environment: {groupedItems[currentEnvIndex]?.envName}
            </h3>
          </div>
        )}

        <div className="h-48 overflow-y-auto rounded-md border border-mineshaft-700">
          <table className="w-full">
            <thead className="border-b border-mineshaft-700 bg-mineshaft-800">
              <tr>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Type</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Path</th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">Usage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mineshaft-700">
              {currentItems.map((item) => (
                <tr key={item.id} className="hover:bg-mineshaft-800">
                  <td className="px-4 py-3">
                    <FontAwesomeIcon
                      icon={item.type === "secret" ? faKey : faFolder}
                      className={`h-4 w-4 ${item.type === "secret" ? "text-gray-400" : "text-yellow-500"}`}
                      aria-hidden="true"
                    />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-300">{truncatePath(item.path)}</td>
                  <td className="px-4 py-3 text-sm text-gray-400">{item.reference}</td>
                </tr>
              ))}
              {currentItems.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-sm text-gray-500">
                    No items in this environment
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalEnvironments > 1 && (
          <div className="mt-4 flex items-center justify-between px-4">
            <div className="text-sm text-gray-400">
              Environment {currentEnvIndex + 1} of {totalEnvironments}
            </div>
            <div className="flex space-x-2">
              {renderPaginationButton("prev", handlePrevEnvironment, currentEnvIndex === 0)}
              {renderPaginationButton(
                "next",
                handleNextEnvironment,
                currentEnvIndex === totalEnvironments - 1
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
