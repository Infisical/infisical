import { components, MultiValueGenericProps, OptionProps } from "react-select";
import { BanIcon, CheckIcon, UserIcon, UsersIcon } from "lucide-react";
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
  isSelected,
  children,
  ...props
}: OptionProps<ApproverOptionData>) => {
  const { type, isOrgMembershipActive } = props.data;
  const isInactive = type === ApproverType.User && isOrgMembershipActive === false;

  return (
    <components.Option isSelected={isSelected} {...props}>
      <div className="flex flex-row items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <TypeIcon type={type} />
          <span className={twMerge("truncate", isInactive && "text-mineshaft-400")}>
            {children}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isInactive && (
            <Badge variant="neutral">
              <BanIcon />
              Inactive
            </Badge>
          )}
          {isSelected && <CheckIcon className="size-4 shrink-0" />}
        </div>
      </div>
    </components.Option>
  );
};

export const ApproverMultiValueLabel = (props: MultiValueGenericProps<ApproverOptionData>) => {
  const { data, children } = props;
  return (
    <components.MultiValueLabel {...props}>
      <span className="flex items-center gap-1.5">
        <TypeIcon type={data.type} />
        {children}
      </span>
    </components.MultiValueLabel>
  );
};
