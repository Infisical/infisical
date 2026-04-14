import { components, MultiValueProps, MultiValueRemoveProps, OptionProps } from "react-select";
import { CheckIcon } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

export type OrgPermissionActionOption = {
  label: string;
  value: string;
  description?: string;
};

export const OptionWithDescription = <T extends OrgPermissionActionOption>(
  props: OptionProps<T>
) => {
  const { data, children, isSelected } = props;
  return (
    <components.Option {...props}>
      <div className="flex flex-row items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="truncate">{children}</p>
          {data.description && (
            <p className="truncate text-xs leading-4 text-muted">{data.description}</p>
          )}
        </div>
        {isSelected && <CheckIcon className="ml-2 size-4 shrink-0" />}
      </div>
    </components.Option>
  );
};

export const MultiValueRemove = ({ selectProps, ...props }: MultiValueRemoveProps) => {
  if (selectProps?.isDisabled) {
    return null;
  }
  return <components.MultiValueRemove selectProps={selectProps} {...props} />;
};

export const MultiValueWithTooltip = <T extends OrgPermissionActionOption>(
  props: MultiValueProps<T>
) => {
  const { data } = props;
  if (!data.description) {
    return <components.MultiValue {...props} />;
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div>
          <components.MultiValue {...props} />
        </div>
      </TooltipTrigger>
      <TooltipContent>{data.description}</TooltipContent>
    </Tooltip>
  );
};
