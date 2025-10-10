import { Dispatch, SetStateAction } from "react";
import { faFileImport, faFingerprint, faFolder, faKey } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Handle, NodeProps, Position } from "@xyflow/react";

import { ProjectPermissionSub } from "@app/context";
import { TProjectEnvironmentsFolders } from "@app/hooks/api/secretFolders/types";

import { createRoleNode } from "../utils";

const getSubjectIcon = (subject: ProjectPermissionSub) => {
  switch (subject) {
    case ProjectPermissionSub.Secrets:
      return <FontAwesomeIcon icon={faKey} className="text-bunker-300 h-4 w-4" />;
    case ProjectPermissionSub.SecretFolders:
      return <FontAwesomeIcon icon={faFolder} className="h-4 w-4 text-yellow-700" />;
    case ProjectPermissionSub.DynamicSecrets:
      return <FontAwesomeIcon icon={faFingerprint} className="h-4 w-4 text-yellow-700" />;
    case ProjectPermissionSub.SecretImports:
      return <FontAwesomeIcon icon={faFileImport} className="h-4 w-4 text-green-700" />;
    default:
      return <FontAwesomeIcon icon={faKey} className="text-bunker-300 h-4 w-4" />;
  }
};

const formatLabel = (text: string) => {
  return text.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

export const RoleNode = ({
  data: { subject }
}: NodeProps & {
  data: ReturnType<typeof createRoleNode>["data"] & {
    onSubjectChange: Dispatch<SetStateAction<ProjectPermissionSub>>;
    onEnvironmentChange: (value: string) => void;
    environments: TProjectEnvironmentsFolders;
  };
}) => {
  return (
    <>
      <Handle
        type="target"
        className="cursor-pointer! pointer-events-none opacity-0"
        position={Position.Top}
      />
      <div className="border-mineshaft bg-mineshaft-800 font-inter flex h-14 w-full flex-col items-center justify-center rounded-md border px-2 py-3 shadow-lg transition-opacity duration-500">
        <div className="text-mineshaft-100 flex items-center space-x-2">
          {getSubjectIcon(subject)}
          <span className="text-sm">{formatLabel(subject)} Access</span>
        </div>
      </div>
      <Handle
        type="source"
        className="cursor-pointer! pointer-events-none opacity-0"
        position={Position.Bottom}
      />
    </>
  );
};
