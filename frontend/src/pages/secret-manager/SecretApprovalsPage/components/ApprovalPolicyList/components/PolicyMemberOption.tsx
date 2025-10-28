import { components, OptionProps } from "react-select";
import { faCheckCircle } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { BanIcon } from "lucide-react";
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
        {isSelected && (
          <FontAwesomeIcon className="ml-2 text-primary" icon={faCheckCircle} size="sm" />
        )}
      </div>
    </components.Option>
  );
};
