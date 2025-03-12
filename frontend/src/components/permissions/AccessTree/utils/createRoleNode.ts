import { PermissionNode } from "../types";

export const createRoleNode = ({
  subject,
  environment
}: {
  subject: string;
  environment: string;
}) => ({
  id: `role-${subject}-${environment}`,
  position: { x: 0, y: 0 },
  data: {
    subject,
    environment
  },
  type: PermissionNode.Role,
  height: 48,
  width: 264
});
