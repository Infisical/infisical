import {
  ClearIndicatorProps,
  components,
  DropdownIndicatorProps,
  GroupProps,
  MultiValueRemoveProps,
  OptionProps
} from "react-select";
import { CheckIcon, ChevronDownIcon, CircleXIcon, XIcon } from "lucide-react";

export const DropdownIndicator = <T,>(props: DropdownIndicatorProps<T>) => {
  return (
    <components.DropdownIndicator {...props}>
      <ChevronDownIcon />
    </components.DropdownIndicator>
  );
};

export const ClearIndicator = <T,>(props: ClearIndicatorProps<T>) => {
  return (
    <components.ClearIndicator {...props}>
      <CircleXIcon />
    </components.ClearIndicator>
  );
};

export const MultiValueRemove = (props: MultiValueRemoveProps) => {
  return (
    <components.MultiValueRemove {...props}>
      <XIcon />
    </components.MultiValueRemove>
  );
};

export const Option = <T,>({ isSelected, children, ...props }: OptionProps<T>) => {
  return (
    <components.Option isSelected={isSelected} {...props}>
      <div className="flex flex-row items-center justify-between">
        <p className="truncate">{children}</p>
        {isSelected && <CheckIcon className="ml-2 text-foreground" size="sm" />}
      </div>
    </components.Option>
  );
};

export const Group = <T,>(props: GroupProps<T>) => {
  return <components.Group {...props} />;
};
