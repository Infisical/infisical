import {
  ClearIndicatorProps,
  components,
  DropdownIndicatorProps,
  GroupProps,
  MultiValueRemoveProps,
  OptionProps
} from "react-select";
import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react";

export const DropdownIndicator = <T,>(props: DropdownIndicatorProps<T>) => (
  <components.DropdownIndicator {...props}>
    <ChevronDownIcon />
  </components.DropdownIndicator>
);

export const ClearIndicator = <T,>(props: ClearIndicatorProps<T>) => (
  <components.ClearIndicator {...props}>
    <XIcon />
  </components.ClearIndicator>
);

export const MultiValueRemove = (props: MultiValueRemoveProps) => {
  // eslint-disable-next-line react/destructuring-assignment
  return props.selectProps?.isDisabled ? null : (
    <components.MultiValueRemove {...props}>
      <XIcon />
    </components.MultiValueRemove>
  );
};

export const Option = <T,>({ isSelected, children, ...props }: OptionProps<T>) => (
  <components.Option isSelected={isSelected} {...props}>
    <div className="flex flex-row items-center justify-between">
      <p className="truncate">{children}</p>
      {isSelected && <CheckIcon className="ml-2 size-4" />}
    </div>
  </components.Option>
);

export const Group = <T,>(props: GroupProps<T>) => {
  return <components.Group {...props} />;
};
