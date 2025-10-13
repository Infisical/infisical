import { components, OptionProps } from "react-select";
import { faCheckCircle } from "@fortawesome/free-regular-svg-icons";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Badge } from "@app/components/v2";
import { PAM_RESOURCE_TYPE_MAP, PamResourceType } from "@app/hooks/api/pam";

export const PamResourceOption = ({
  isSelected,
  children,
  ...props
}: OptionProps<{ id: string; name: string; resourceType: PamResourceType }>) => {
  const isCreateOption = props.data.id === "_create";

  const { name, image } = PAM_RESOURCE_TYPE_MAP[props.data.resourceType];

  return (
    <components.Option isSelected={isSelected} {...props}>
      <div className="flex flex-row items-center justify-between">
        {isCreateOption ? (
          <div className="flex items-center gap-x-1 text-mineshaft-400">
            <FontAwesomeIcon icon={faPlus} size="sm" />
            <span className="mr-auto">Create New Resource</span>
          </div>
        ) : (
          <>
            <p className="truncate">{children}</p>
            <div className="mr-auto ml-2">
              <Badge className="flex h-5 items-center gap-1 bg-mineshaft-400/50 whitespace-nowrap text-bunker-300">
                <img
                  alt={`${name} logo`}
                  src={`/images/integrations/${image}`}
                  className="size-3"
                />
                {name}
              </Badge>
            </div>
            {isSelected && (
              <FontAwesomeIcon className="ml-2 text-primary" icon={faCheckCircle} size="sm" />
            )}
          </>
        )}
      </div>
    </components.Option>
  );
};
