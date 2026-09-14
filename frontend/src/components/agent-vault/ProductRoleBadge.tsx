import { ShieldIcon, UserIcon } from "lucide-react";

import { Badge } from "@app/components/v3";
import { formatProjectRoleName } from "@app/helpers/roles";
import { ProjectMembershipRole } from "@app/hooks/api/roles/types";

export const ProductRoleBadge = ({ role }: { role: string }) => {
  const isAdmin = role === ProjectMembershipRole.Admin;

  return (
    <Badge variant={isAdmin ? "av" : "neutral"}>
      {isAdmin ? <ShieldIcon /> : <UserIcon />}
      {formatProjectRoleName(role)}
    </Badge>
  );
};
