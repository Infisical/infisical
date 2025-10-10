import { components, OptionProps } from "react-select";
import { faCheckCircle } from "@fortawesome/free-regular-svg-icons";
import { faBuilding, faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Badge, Tooltip } from "@app/components/v2";
import { TAvailableAppConnection } from "@app/hooks/api/appConnections";

export const AppConnectionOption = ({
  isSelected,
  children,
  ...props
}: OptionProps<TAvailableAppConnection>) => {
  const isCreateOption = props.data.id === "_create";

  return (
    <components.Option isSelected={isSelected} {...props}>
      <div className="flex flex-row items-center justify-between">
        {isCreateOption ? (
          <div className="flex items-center gap-x-1 text-mineshaft-400">
            <FontAwesomeIcon icon={faPlus} size="sm" />
            <span className="mr-auto">Create New Connection</span>
          </div>
        ) : (
          <>
            <p className="truncate">{children}</p>
            {!props.data.projectId && (
              <Tooltip content="This connection belongs to your organization.">
                <div className="mr-auto ml-2">
                  <Badge className="flex h-5 w-min items-center gap-1 bg-mineshaft-400/50 whitespace-nowrap text-bunker-300 hover:text-bunker-300">
                    <FontAwesomeIcon icon={faBuilding} size="sm" />
                    Organization
                  </Badge>
                </div>
              </Tooltip>
            )}
            {isSelected && (
              <FontAwesomeIcon className="ml-2 text-primary" icon={faCheckCircle} size="sm" />
            )}
          </>
        )}
      </div>
    </components.Option>
  );
};
