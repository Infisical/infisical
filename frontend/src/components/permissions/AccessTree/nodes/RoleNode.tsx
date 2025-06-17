import { Dispatch, SetStateAction } from "react";
import { faFileImport, faFingerprint, faFolder, faKey } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Handle, NodeProps, Position } from "@xyflow/react";

import { Select, SelectItem } from "@app/components/v2";
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
  data: { subject, environment, onSubjectChange, onEnvironmentChange, environments }
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
      <div className="flex w-full flex-col items-center justify-center rounded-md border-2 border-mineshaft-500 bg-gradient-to-b from-mineshaft-700 to-mineshaft-800 px-5 py-4 font-inter shadow-2xl">
        <div className="flex w-full min-w-[240px] flex-col gap-4">
          <div className="flex w-full flex-col gap-1.5">
            <div className="ml-1 text-xs font-semibold text-mineshaft-200">Subject</div>
            <Select
              value={subject}
              onValueChange={(value) => onSubjectChange(value as ProjectPermissionSub)}
              className="w-full rounded-md border border-mineshaft-600 bg-mineshaft-900/90 text-sm shadow-inner backdrop-blur-sm transition-all hover:border-amber-600/50 focus:border-amber-500"
              position="popper"
              dropdownContainerClassName="max-w-none"
              aria-label="Subject"
            >
              {[
                ProjectPermissionSub.Secrets,
                ProjectPermissionSub.SecretFolders,
                ProjectPermissionSub.DynamicSecrets,
                ProjectPermissionSub.SecretImports
              ].map((sub) => {
                return (
                  <SelectItem
                    className="relative flex items-center gap-2 py-2 pl-8 pr-8 text-sm capitalize hover:bg-mineshaft-700"
                    value={sub}
                    key={sub}
                  >
                    <div className="flex items-center gap-3">
                      {getSubjectIcon(sub)}
                      <span className="font-medium">{formatLabel(sub)}</span>
                    </div>
                  </SelectItem>
                );
              })}
            </Select>
          </div>

          <div className="flex w-full flex-col gap-1.5">
            <div className="ml-1 text-xs font-semibold text-mineshaft-200">Environment</div>
            <Select
              value={environment}
              onValueChange={onEnvironmentChange}
              className="w-full rounded-md border border-mineshaft-600 bg-mineshaft-900/90 text-sm shadow-inner backdrop-blur-sm transition-all hover:border-amber-600/50 focus:border-amber-500"
              position="popper"
              dropdownContainerClassName="max-w-none"
              aria-label="Environment"
            >
              {Object.values(environments).map((env) => (
                <SelectItem
                  key={env.slug}
                  value={env.slug}
                  className="relative py-2 pl-6 pr-8 text-sm hover:bg-mineshaft-700"
                >
                  <div className="ml-3 font-medium">{env.name}</div>
                </SelectItem>
              ))}
            </Select>
          </div>
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
