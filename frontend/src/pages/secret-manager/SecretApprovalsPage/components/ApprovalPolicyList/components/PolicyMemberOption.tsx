import { components, OptionProps } from "react-select";
import { BanIcon, CheckIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { Badge } from "@app/components/v3";
import { BypasserType } from "@app/hooks/api/accessApproval/types";
import { ApproverType } from "@app/hooks/api/secretApproval/types";

export const PolicyMemberOption = ({
  isSelected,
  children,
  ...props
}: OptionProps<{
  id: string;
  type: BypasserType | ApproverType;
  isOrgMembershipActive?: boolean;
}>) => {
  return (
    <components.Option isSelected={isSelected} {...props}>
      <div className="flex flex-row items-center justify-between">
        <p
          className={twMerge("truncate", !props.data.isOrgMembershipActive && "text-mineshaft-400")}
        >
          {children}
        </p>
        {!props.data.isOrgMembershipActive && (
          <Badge className="ml-auto" variant="neutral">
            <BanIcon />
            Inactive
          </Badge>
        )}
        {isSelected && <CheckIcon className="ml-2 size-4 shrink-0" />}
      </div>
    </components.Option>
  );
};
