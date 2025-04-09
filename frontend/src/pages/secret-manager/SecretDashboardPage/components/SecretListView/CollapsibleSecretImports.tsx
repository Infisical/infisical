import React, { KeyboardEvent, useMemo, useState } from "react";
import {
  faChevronDown,
  faChevronRight,
  faCodeBranch,
  faFolder,
  faKey,
  faWarning
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface Folder {
  folderName: string;
  secrets?: string[];
}

interface Environment {
  envName: string;
  folders: Folder[];
}

interface FlatItem {
  type: "folder" | "secret" | "environment";
  path: string;
  secretKey?: string;
  envName?: string;
  depth?: number;
  id: string;
}

interface CollapsibleSecretImportsProps {
  importedBy?: Environment[];
}

export const CollapsibleSecretImports: React.FC<CollapsibleSecretImportsProps> = ({
  importedBy = []
}) => {
  const [expandedEnvs, setExpandedEnvs] = useState<Record<string, boolean>>(
    importedBy.reduce((acc, env) => ({ ...acc, [env.envName]: true }), {})
  );

  const toggleEnvironment = (envName: string) => {
    setExpandedEnvs((prev) => ({
      ...prev,
      [envName]: !prev[envName]
    }));
  };

  const handleKeyDown = (envName: string, e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleEnvironment(envName);
    }
  };

  const truncatePath = (path: string, maxLength: number = 45) => {
    if (path.length <= maxLength) return path;
    return `...${path.slice(-(maxLength - 3))}`;
  };

  const processedEnvironments = useMemo(() => {
    return importedBy.map((env) => {
      const items: FlatItem[] = [
        {
          type: "environment",
          path: env.envName,
          envName: env.envName,
          id: `env-${env.envName}`
        }
      ];

      env.folders.forEach((folder) => {
        const folderId = `folder-${env.envName}-${folder.folderName}`;
        items.push({
          type: "folder",
          path: folder.folderName,
          id: folderId
        });

        if (folder.secrets && folder.secrets.length > 0) {
          folder.secrets.forEach((secret) => {
            const secretPath =
              folder.folderName === "/" ? `/${secret}` : `${folder.folderName}/${secret}`;
            const secretId = `secret-${env.envName}-${secretPath}`;

            items.push({
              type: "secret",
              path: secretPath,
              secretKey: secret,
              id: secretId
            });
          });
        }
      });

      const [envItem, ...rest] = items;
      rest.sort((a, b) => {
        const aSegments = a.path.split("/").filter(Boolean);
        const bSegments = b.path.split("/").filter(Boolean);

        for (let i = 0; i < Math.min(aSegments.length, bSegments.length); i += 1) {
          if (aSegments[i] !== bSegments[i]) {
            return aSegments[i].localeCompare(bSegments[i]);
          }
        }

        return aSegments.length - bSegments.length;
      });

      return {
        ...env,
        items: [envItem, ...rest]
      };
    });
  }, [importedBy]);

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-mineshaft-600 bg-red-900/20 shadow-lg">
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

      <div className="scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-gray-850 max-h-64 overflow-y-auto">
        <div className="w-full divide-y divide-gray-800">
          {processedEnvironments.map((env) => (
            <div key={env.envName} className="w-full">
              <button
                type="button"
                onClick={() => toggleEnvironment(env.envName)}
                onKeyDown={(e) => handleKeyDown(env.envName, e)}
                className="flex w-full cursor-pointer items-center px-4 py-3 text-left text-gray-200 transition-colors hover:bg-red-900/40"
                aria-expanded={expandedEnvs[env.envName]}
                aria-controls={`env-content-${env.envName}`}
              >
                <div className="flex flex-1 items-center">
                  <FontAwesomeIcon
                    icon={faCodeBranch}
                    className="mr-3 h-3.5 w-3.5 text-red-500"
                    aria-hidden="true"
                  />
                  <span className="font-medium">{env.envName}</span>
                </div>
                <div className="flex h-6 w-6 items-center justify-center rounded-full transition-colors">
                  <FontAwesomeIcon
                    icon={expandedEnvs[env.envName] ? faChevronDown : faChevronRight}
                    className="h-3 w-3 text-gray-400"
                    aria-hidden="true"
                  />
                </div>
              </button>

              {expandedEnvs[env.envName] && (
                <div id={`env-content-${env.envName}`} className="bg-mineshaft-850">
                  {env.items.slice(1).map((item) => {
                    const isSecret = item.type === "secret";

                    return (
                      <div
                        key={item.id}
                        className="flex items-center px-6 py-2 text-gray-300 transition-colors"
                        role="listitem"
                      >
                        <div className="flex items-center">
                          <FontAwesomeIcon
                            icon={isSecret ? faKey : faFolder}
                            className={`mr-2.5 h-3 w-3 ${isSecret ? "text-red-400" : "text-red-500"}`}
                            aria-hidden="true"
                          />
                          <span className="max-w-md truncate text-xs">
                            {truncatePath(item.path)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
