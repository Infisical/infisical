import { components, OptionProps } from "react-select";
import { faCheckCircle } from "@fortawesome/free-regular-svg-icons";
import { faBan } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { Badge } from "@app/components/v2";
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
          <Badge className="bg-mineshaft-400/50 text-bunker-300 pointer-events-none ml-1 mr-auto flex h-5 w-min items-center gap-1.5 whitespace-nowrap">
            <FontAwesomeIcon icon={faBan} />
            Inactive
          </Badge>
        )}
        {isSelected && (
          <FontAwesomeIcon className="text-primary ml-2" icon={faCheckCircle} size="sm" />
        )}
      </div>
    </components.Option>
  );
};
