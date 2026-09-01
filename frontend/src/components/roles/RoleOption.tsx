import { components, OptionProps } from "react-select";
import { CheckIcon } from "lucide-react";

export const RoleOption = ({
  isSelected,
  children,
  ...props
}: OptionProps<{ name: string; slug: string; description?: string | undefined }>) => {
  return (
    <components.Option isSelected={isSelected} {...props}>
      <div className="flex flex-row items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="truncate">{children}</p>
          {props.data.description ? (
            <p className="text-xs leading-4 break-words whitespace-normal text-mineshaft-400">
              {props.data.description}
            </p>
          ) : (
            <p className="text-xs leading-4 text-mineshaft-400/50">No Description</p>
          )}
        </div>
        {isSelected && <CheckIcon className="ml-2 size-4 shrink-0" />}
      </div>
    </components.Option>
  );
};
