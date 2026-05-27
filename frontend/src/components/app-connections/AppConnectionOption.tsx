import { components, OptionProps } from "react-select";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { CheckIcon } from "lucide-react";

import { Tooltip } from "@app/components/v2";
import { Badge, OrgIcon, SubOrgIcon } from "@app/components/v3";
import { useOrganization } from "@app/context";
import { TAvailableAppConnection } from "@app/hooks/api/appConnections";

export const AppConnectionOption = ({
  isSelected,
  children,
  ...props
}: OptionProps<TAvailableAppConnection>) => {
  const isCreateOption = props.data.id === "_create";
  const isOnlyOption = isCreateOption && props.selectProps.options.length === 1;

  const { isSubOrganization } = useOrganization();

  return (
    <components.Option isSelected={isSelected} {...props}>
      <div className="flex flex-row items-center justify-between">
        {isCreateOption ? (
          <div
            className={`flex items-center gap-x-1 ${isOnlyOption ? "text-foreground" : "text-accent"}`}
          >
            <FontAwesomeIcon icon={faPlus} size="sm" />
            <span className="mr-auto">Create New Connection</span>
          </div>
        ) : (
          <>
            <p className="mr-auto truncate">{children}</p>
            {!props.data.projectId && (
              <Tooltip
                content={`This connection belongs to your ${isSubOrganization ? "sub-" : ""}organization.`}
              >
                {isSubOrganization ? (
                  <Badge variant="sub-org">
                    <SubOrgIcon />
                    Sub-Organization
                  </Badge>
                ) : (
                  <Badge variant="org">
                    <OrgIcon />
                    Organization
                  </Badge>
                )}
              </Tooltip>
            )}
            {isSelected && <CheckIcon className="ml-2 size-4" />}
          </>
        )}
      </div>
    </components.Option>
  );
};
