import { components, OptionProps } from "react-select";
import { faCheckCircle } from "@fortawesome/free-regular-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export const RoleOption = ({
  isSelected,
  children,
  ...props
}: OptionProps<{ name: string; slug: string; description?: string | undefined }>) => {
  return (
    <components.Option isSelected={isSelected} {...props}>
      <div className="flex flex-row items-center justify-between">
        <div>
          <p className="truncate">{children}</p>
          {props.data.description ? (
            <p className="text-mineshaft-400 truncate text-xs leading-4">
              {props.data.description}
            </p>
          ) : (
            <p className="text-mineshaft-400/50 text-xs leading-4">No Description</p>
          )}
        </div>
        {isSelected && (
          <FontAwesomeIcon className="text-primary ml-2" icon={faCheckCircle} size="sm" />
        )}
      </div>
    </components.Option>
  );
};
