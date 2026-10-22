import { components, OptionProps } from "react-select";
import { CheckIcon } from "lucide-react";

export const RoleOptionContent = ({
  role
}: {
  role: { name: string; description?: string | undefined };
}) => (
  <div className="min-w-0">
    <p className="truncate">{role.name}</p>
    {role.description ? (
      <p className="text-xs leading-4 break-words whitespace-normal text-muted">
        {role.description}
      </p>
    ) : (
      <p className="text-xs leading-4 text-muted/50">No Description</p>
    )}
  </div>
);

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
            <p className="text-xs leading-4 break-words whitespace-normal text-muted">
              {props.data.description}
            </p>
          ) : (
            <p className="text-xs leading-4 text-muted/50">No Description</p>
          )}
        </div>
        {isSelected && <CheckIcon className="ml-2 size-4 shrink-0" />}
      </div>
    </components.Option>
  );
};
