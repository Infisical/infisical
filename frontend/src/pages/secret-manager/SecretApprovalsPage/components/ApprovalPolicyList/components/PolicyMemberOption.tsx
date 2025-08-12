import { components, OptionProps } from "react-select";
import { faCheckCircle } from "@fortawesome/free-regular-svg-icons";
import { faBan } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { Badge } from "@app/components/v2";
import { ApproverType } from "@app/hooks/api/accessApproval/types";

export const PolicyMemberOption = ({
  isSelected,
  children,
  ...props
}: OptionProps<{
  id: string;
  isOrgMembershipActive: boolean;
  type: ApproverType;
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
          <Badge className="pointer-events-none ml-1 mr-auto flex h-5 w-min items-center gap-1.5 whitespace-nowrap bg-mineshaft-400/50 text-bunker-300">
            <FontAwesomeIcon icon={faBan} />
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
