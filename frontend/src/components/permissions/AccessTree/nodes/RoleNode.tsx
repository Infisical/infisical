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
      return <FontAwesomeIcon icon={faKey} className="h-4 w-4 text-bunker-300" />;
    case ProjectPermissionSub.SecretFolders:
      return <FontAwesomeIcon icon={faFolder} className="h-4 w-4 text-yellow-700" />;
    case ProjectPermissionSub.DynamicSecrets:
      return <FontAwesomeIcon icon={faFingerprint} className="h-4 w-4 text-yellow-700" />;
    case ProjectPermissionSub.SecretImports:
      return <FontAwesomeIcon icon={faFileImport} className="h-4 w-4 text-green-700" />;
    default:
      return <FontAwesomeIcon icon={faKey} className="h-4 w-4 text-bunker-300" />;
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
        className="pointer-events-none !cursor-pointer opacity-0"
        position={Position.Top}
      />
      <div className="flex h-14 w-full flex-col items-center justify-center rounded-md border border-mineshaft bg-mineshaft-800 px-2 py-3 font-inter shadow-lg transition-opacity duration-500">
        <div className="flex items-center space-x-2 text-mineshaft-100">
          {getSubjectIcon(subject)}
          <span className="text-sm">{formatLabel(subject)} Access</span>
        </div>
      </div>
      <Handle
        type="source"
        className="pointer-events-none !cursor-pointer opacity-0"
        position={Position.Bottom}
      />
    </>
  );
};
