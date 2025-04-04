import React, { useEffect, useState } from "react";
import { faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Select, SelectItem } from "@app/components/v2";

import { SecretTreeView } from "../ActionBar/ReplicateFolderFromBoard/SecretTreeView";

interface Folder {
  folderName: string;
  secrets?: string[];
}

interface Environment {
  envName: string;
  folders: Folder[];
}

interface SecretDeletionImpactProps {
  importedBy?: Environment[];
}

interface SecretItem {
  id: string;
  secretKey: string;
  secretValue?: string;
  secretPath?: string;
}

interface FolderStructure {
  items: SecretItem[];
  subFolders: {
    [key: string]: FolderStructure;
  };
}

export const SecretDeletionImpact: React.FC<SecretDeletionImpactProps> = ({ importedBy = [] }) => {
  const [treeData, setTreeData] = useState<FolderStructure | null>(null);
  const [selectedEnv, setSelectedEnv] = useState<string>(importedBy[0]?.envName || "");

  const handleEnvironmentChange = (value: string) => {
    setSelectedEnv(value);
  };

  function transformImportedDataToTreeView(
    environments: Environment[],
    selectedEnvironment: string
  ): FolderStructure | null {
    const environment = environments.find((env) => env.envName === selectedEnvironment);
    if (!environment) return null;

    const rootStructure: FolderStructure = {
      items: [],
      subFolders: {}
    };

    environment.folders.forEach((folder) => {
      const path = folder.folderName;
      const pathParts = path.split("/").filter((part) => part !== "");

      if (pathParts.length === 0) {
        if (folder.secrets && folder.secrets.length > 0) {
          folder.secrets.forEach((secret) => {
            rootStructure.items.push({
              id: `${selectedEnvironment}:${path}:${secret}`,
              secretKey: secret,
              secretPath: path
            });
          });
        }
        return;
      }

      let current = rootStructure;

      pathParts.forEach((part, index) => {
        if (!current.subFolders[part]) {
          current.subFolders[part] = {
            items: [],
            subFolders: {}
          };
        }

        current = current.subFolders[part];

        const isLastPart = index === pathParts.length - 1;
        if (isLastPart && folder.secrets && folder.secrets.length > 0) {
          folder.secrets.forEach((secret) => {
            current.items.push({
              id: `${selectedEnvironment}:${path}:${secret}`,
              secretKey: secret,
              secretPath: path
            });
          });
        }
      });
    });

    return rootStructure;
  }

  useEffect(() => {
    const transformedData = transformImportedDataToTreeView(importedBy, selectedEnv);
    setTreeData(transformedData);
  }, [selectedEnv, importedBy]);

  return (
    <div className="mt-4 max-h-[50vh] overflow-y-auto rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-5 shadow-lg">
      <div className="mb-4 flex items-start gap-3 rounded-md border border-red-800 bg-red-900/20 p-3">
        <div className="flex-shrink-0 text-red-400">
          <FontAwesomeIcon icon={faWarning} className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-medium text-red-300">
            Warning: This secret is imported by another folder
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs text-red-300">
            <li>Deleting will remove it from all locations where it&apos;s imported</li>
            <li className="mt-1">
              Any dependent secrets will display their reference syntax (like{" "}
              {"{env.secretPath.key}"}) instead of actual values
            </li>
            <li className="mt-1">Dependent secrets themselves will not be automatically deleted</li>
          </ul>
        </div>
      </div>

      <div className="space-y-4">
        <SecretTreeView data={treeData} basePath="/" onChange={() => {}} isDisabled />
      </div>

      <div className="mt-4 flex justify-end">
        <Select
          className="w-44 rounded-md border border-mineshaft-600 bg-mineshaft-700 text-gray-200"
          onValueChange={handleEnvironmentChange}
          defaultValue={selectedEnv}
        >
          {importedBy.map((env) => (
            <SelectItem
              value={env.envName}
              key={env.envName}
              className="data-[highlighted]:bg-mineshaft-600"
            >
              <div className="flex items-center gap-2 text-gray-200">{env.envName}</div>
            </SelectItem>
          ))}
        </Select>
      </div>
    </div>
  );
};
