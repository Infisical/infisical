import { components, OptionProps } from "react-select";
import { faCheckCircle } from "@fortawesome/free-regular-svg-icons";
import { faPlus, faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export const RelayOption = ({
  isSelected,
  children,
  ...props
}: OptionProps<{ id: string; name: string }>) => {
  const isCreateOption = props.data.id === "_create";
  const isAutoOption = props.data.id === "_auto";

  return (
    <components.Option isSelected={isSelected} {...props}>
      <div className="flex flex-row items-center justify-between">
        {isCreateOption && (
          <div className="flex items-center gap-x-1 text-mineshaft-400">
            <FontAwesomeIcon icon={faPlus} size="sm" />
            <span className="mr-auto">Deploy New Relay</span>
          </div>
        )}
        {isAutoOption && (
          <div className="flex items-center gap-x-1 text-mineshaft-400">
            <FontAwesomeIcon icon={faWandMagicSparkles} size="sm" />
            <span className="mr-auto">Auto Select Relay</span>
          </div>
        )}
        {!isCreateOption && !isAutoOption && (
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
