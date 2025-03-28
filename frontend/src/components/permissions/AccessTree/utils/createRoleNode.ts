import { Dispatch, SetStateAction } from "react";

import { ProjectPermissionSub } from "@app/context";
import { TProjectEnvironmentsFolders } from "@app/hooks/api/secretFolders/types";

import { PermissionNode } from "../types";

export const createRoleNode = ({
  subject,
  environment,
  environments,
  onSubjectChange,
  onEnvironmentChange
}: {
  subject: string;
  environment: string;
  environments: TProjectEnvironmentsFolders;
  onSubjectChange: Dispatch<SetStateAction<ProjectPermissionSub>>;
  onEnvironmentChange: (value: string) => void;
}) => ({
  id: `role-${subject}-${environment}`,
  position: { x: 0, y: 0 },
  data: {
    subject,
    environment,
    environments,
    onSubjectChange,
    onEnvironmentChange
  },
  type: PermissionNode.Role,
  height: 48,
  width: 264
});
