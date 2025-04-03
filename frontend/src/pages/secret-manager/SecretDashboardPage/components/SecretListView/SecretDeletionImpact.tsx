import React from "react";
import { faFolder, faKey, faServer, faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

interface Folder {
  folderName: string;
  secrets?: string[];
}

interface ImportedByEnvironment {
  envName: string;
  folders: Folder[];
}

interface SecretDeletionImpactProps {
  importedBy?: ImportedByEnvironment[];
}

export const SecretDeletionImpact: React.FC<SecretDeletionImpactProps> = ({ importedBy = [] }) => {
  const truncateId = (id: string): string => {
    if (id.length <= 16) return id;
    return `${id.substring(0, 8)}...${id.substring(id.length - 8)}`;
  };

  return (
    <div className="mt-4 max-h-[40vh] overflow-y-auto rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-5 shadow-lg">
      <div className="mb-4 flex items-start gap-3 rounded-md border border-red-800 bg-red-900/20 p-3">
        <div className="flex-shrink-0 text-red-400">
          <FontAwesomeIcon icon={faWarning} className="h-5 w-5" />
        </div>
        <p className="text-sm font-medium text-red-300">
          Warning: This secret is currently being imported by another folder, so deletion will
          affect both locations.
        </p>
      </div>

      <div className="space-y-4">
        {importedBy.map((envData, envIndex) => (
          <div
            key={`${envData.envName}-${envIndex + 1}`}
            className="rounded-lg border border-mineshaft-600 bg-mineshaft-700 p-4 shadow-sm"
          >
            <h5 className="mb-3 flex items-center text-sm font-semibold text-gray-300">
              <FontAwesomeIcon icon={faServer} className="mr-2 h-4 w-4 text-mineshaft-400" />
              {envData.envName} Environment
            </h5>

            {envData.folders.length > 0 && (
              <div className="mb-5">
                <div className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
                  Affected Folders
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {envData.folders
                    .filter((folder) => !folder.secrets || folder.secrets.length === 0)
                    .map((folder, folderIndex) => (
                      <div
                        key={`folder-${folderIndex + 1}-${envData.envName}`}
                        className="flex items-center rounded-md border border-mineshaft-500 px-3 py-2 transition-colors"
                      >
                        <FontAwesomeIcon icon={faFolder} className="mr-2 h-4 w-4 text-yellow-700" />
                        <span className="text-sm">{folder.folderName}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {envData.folders.some((folder) => folder.secrets && folder.secrets.length > 0) && (
              <div>
                <div className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
                  Affected Secrets
                </div>
                <div className="space-y-4">
                  {envData.folders
                    .filter((folder) => folder.secrets && folder.secrets.length > 0)
                    .map((folder) => (
                      <div
                        key={`folder-secrets-${folder.folderName}-${envData.envName}`}
                        className="rounded-md bg-mineshaft-600/70 p-3"
                      >
                        <div className="mb-2 flex items-center">
                          <FontAwesomeIcon
                            icon={faFolder}
                            className="mr-2 h-3.5 w-3.5 text-yellow-700"
                          />
                          <span className="text-xs font-medium">{folder.folderName}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 border-l-2 border-mineshaft-400 pl-2">
                          {(folder.secrets || []).map((secret) => (
                            <div
                              key={`secret-${secret}-${envData.envName}`}
                              className="flex items-center rounded-md border border-mineshaft-400 px-3 py-2 transition-colors"
                            >
                              <FontAwesomeIcon
                                icon={faKey}
                                className="mr-2 h-4 w-4 text-mineshaft-400"
                              />
                              <div>
                                <span className="block font-mono text-xs font-medium">
                                  {truncateId(secret)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
