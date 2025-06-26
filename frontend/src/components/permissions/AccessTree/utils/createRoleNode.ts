import { ProjectPermissionSub } from "@app/context";
import { TProjectEnvironmentsFolders } from "@app/hooks/api/secretFolders/types";

import { PermissionNode } from "../types";

export const createRoleNode = ({
  subject,
  environment,
  environments
}: {
  subject: ProjectPermissionSub;
  environment: string;
  environments: TProjectEnvironmentsFolders;
}) => ({
  id: `role-${subject}-${environment}`,
  position: { x: 0, y: 0 },
  data: {
    subject,
    environment,
    environments
  },
  type: PermissionNode.Role,
  height: 48,
  width: 264
});
