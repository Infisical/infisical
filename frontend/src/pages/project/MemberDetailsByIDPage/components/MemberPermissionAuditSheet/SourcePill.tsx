import { ClockIcon, ShieldIcon, UsersIcon, ZapIcon } from "lucide-react";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { formatProjectRoleName } from "@app/helpers/roles";
import { TPermissionAuditSourceType } from "@app/hooks/api/projects/types";

import { SourceRef } from "./permission-audit.types";

const TYPE_LABEL: Record<TPermissionAuditSourceType, string> = {
  role: "Direct role",
  group_role: "Group-inherited role",
  additional_privilege: "Additional privilege"
};

const TYPE_ICON: Record<TPermissionAuditSourceType, typeof ShieldIcon> = {
  role: ShieldIcon,
  group_role: UsersIcon,
  additional_privilege: ZapIcon
};

const displayName = (source: SourceRef): string => {
  if (source.type === "additional_privilege") return source.name;
  return formatProjectRoleName(source.slug ?? source.name, source.name);
};

type Props = {
  source: SourceRef;
  forbidding?: boolean;
};

export const SourcePill = ({ source, forbidding = false }: Props) => {
  const Icon = TYPE_ICON[source.type];
  const tooltipParts: string[] = [TYPE_LABEL[source.type]];
  if (source.groupName) tooltipParts.push(`via group "${source.groupName}"`);
  if (source.isTemporary && source.temporaryAccessEndTime) {
    tooltipParts.push(`Expires ${new Date(source.temporaryAccessEndTime).toLocaleString()}`);
  }
  if (forbidding) tooltipParts.unshift("Forbids this action");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={forbidding ? "danger" : "neutral"}>
          <Icon />
          <span>{displayName(source)}</span>
          {source.isTemporary ? <ClockIcon /> : null}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{tooltipParts.join(" • ")}</TooltipContent>
    </Tooltip>
  );
};
