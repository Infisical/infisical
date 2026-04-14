import { components, GroupBase, MultiValueProps, MultiValueRemoveProps, OptionProps, Props } from "react-select";
import { CheckIcon } from "lucide-react";

import { FilterableSelect } from "../generic/ReactSelect";
import { Tooltip, TooltipContent, TooltipTrigger } from "../generic/Tooltip";

export type PermissionActionOption = {
  label: string;
  value: string;
  description?: string;
};

const OptionWithDescription = <T extends PermissionActionOption>(props: OptionProps<T>) => {
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

const PermissionActionMultiValueRemove = ({ selectProps, ...props }: MultiValueRemoveProps) => {
  if (selectProps?.isDisabled) return null;
  return <components.MultiValueRemove selectProps={selectProps} {...props} />;
};

const MultiValueWithTooltip = <T extends PermissionActionOption>(props: MultiValueProps<T>) => {
  const { data } = props;
  if (!data.description) return <components.MultiValue {...props} />;
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

type PermissionActionSelectProps<T extends PermissionActionOption> = Omit<
  Props<T, boolean, GroupBase<T>>,
  "isMulti"
> & {
  groupBy?: string | null;
  getGroupHeaderLabel?: ((groupValue: unknown) => string) | null;
  isError?: boolean;
};

export const PermissionActionSelect = <T extends PermissionActionOption>({
  components: customComponents,
  ...props
}: PermissionActionSelectProps<T>) => {
  return (
    <FilterableSelect<T>
      isMulti
      filterOption={(option, inputValue) => {
        if (!inputValue) return true;
        const lowerInput = inputValue.toLowerCase();
        const data = option.data as T;
        return (
          option.label.toLowerCase().includes(lowerInput) ||
          Boolean(data.description?.toLowerCase().includes(lowerInput))
        );
      }}
      components={
        {
          Option: OptionWithDescription,
          MultiValueRemove: PermissionActionMultiValueRemove,
          MultiValue: MultiValueWithTooltip,
          ...customComponents
        } as any
      }
      {...props}
    />
  );
};
