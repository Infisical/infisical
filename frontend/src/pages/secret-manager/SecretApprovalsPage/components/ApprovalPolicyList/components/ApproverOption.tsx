import { BanIcon, UserIcon, UsersIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { Badge } from "@app/components/v3";
import { ApproverType, BypasserType } from "@app/hooks/api/accessApproval/types";

export type ApproverOptionData = {
  id: string;
  type: ApproverType | BypasserType;
  name?: string;
  isOrgMembershipActive?: boolean;
};

const TypeIcon = ({ type }: { type: ApproverType | BypasserType }) =>
  type === ApproverType.Group ? (
    <UsersIcon className="size-3.5 shrink-0 text-muted" />
  ) : (
    <UserIcon className="size-3.5 shrink-0 text-muted" />
  );

export const ApproverOption = ({
  option,
  label
}: {
  option: ApproverOptionData;
  label: string;
}) => {
  const { type, isOrgMembershipActive } = option;
  const isInactive = type === ApproverType.User && isOrgMembershipActive === false;

  return (
    <div className="flex flex-row items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <TypeIcon type={type} />
        <span className={twMerge("truncate", isInactive && "text-muted")}>{label}</span>
      </div>
      {isInactive && (
        <Badge variant="neutral">
          <BanIcon />
          Inactive
        </Badge>
      )}
    </div>
  );
};
