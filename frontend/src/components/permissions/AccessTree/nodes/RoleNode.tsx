import { Dispatch, SetStateAction } from "react";
import { Handle, NodeProps, Position } from "@xyflow/react";
import { FingerprintIcon, FolderIcon, ImportIcon, KeyRoundIcon } from "lucide-react";

import { ProjectPermissionSub } from "@app/context";
import { TProjectEnvironmentsFolders } from "@app/hooks/api/secretFolders/types";

import { createRoleNode } from "../utils";

const getSubjectIcon = (subject: ProjectPermissionSub) => {
  switch (subject) {
    case ProjectPermissionSub.Secrets:
      return <KeyRoundIcon className="size-4 text-secret" />;
    case ProjectPermissionSub.SecretFolders:
      return <FolderIcon className="size-4 text-folder" />;
    case ProjectPermissionSub.DynamicSecrets:
      return <FingerprintIcon className="size-4 text-dynamic-secret" />;
    case ProjectPermissionSub.SecretImports:
      return <ImportIcon className="size-4 text-import" />;
    default:
      return <KeyRoundIcon className="size-4 text-secret" />;
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
        className="pointer-events-none cursor-pointer! opacity-0"
        position={Position.Top}
      />
      <div className="flex h-14 w-full flex-col items-center justify-center rounded-md border border-border bg-card px-2 py-3 transition-opacity duration-300 motion-reduce:transition-none">
        <div className="flex items-center gap-2 text-foreground">
          {getSubjectIcon(subject)}
          <span className="text-sm">{formatLabel(subject)} Access</span>
        </div>
      </div>
      <Handle
        type="source"
        className="pointer-events-none cursor-pointer! opacity-0"
        position={Position.Bottom}
      />
    </>
  );
};
