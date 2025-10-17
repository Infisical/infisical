import { components, OptionProps } from "react-select";
import { faCheckCircle } from "@fortawesome/free-regular-svg-icons";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export const RelayOption = ({
  isSelected,
  children,
  ...props
}: OptionProps<{ id: string; name: string }>) => {
  const isCreateOption = props.data.id === "_create";

  return (
    <components.Option isSelected={isSelected} {...props}>
      <div className="flex flex-row items-center justify-between">
        {isCreateOption ? (
          <div className="flex items-center gap-x-1 text-mineshaft-400">
            <FontAwesomeIcon icon={faPlus} size="sm" />
            <span className="mr-auto">Deploy New Relay</span>
          </div>
        ) : (
          <>
            <p className="truncate">{children}</p>
            {isSelected && (
              <FontAwesomeIcon className="ml-2 text-primary" icon={faCheckCircle} size="sm" />
            )}
          </>
        )}
      </div>
    </components.Option>
  );
};
