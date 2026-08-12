import {
  ClearIndicatorProps,
  components,
  DropdownIndicatorProps,
  GroupProps,
  MenuProps,
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
    <div className="flex cursor-pointer flex-row items-center justify-between">
      <p className="truncate">{children}</p>
      {isSelected && <CheckIcon className="ml-2 size-4 shrink-0" />}
    </div>
  </components.Option>
);

export const Group = <T,>(props: GroupProps<T>) => {
  return <components.Group {...props} />;
};

// The menu portals to document.body, which puts it outside the scroll lock a Radix dialog installs
// (react-remove-scroll cancels wheel/touch events for anything it doesn't own), so the menu would
// not scroll inside a modal. Swallowing the event here keeps it from reaching that document listener.
export const Menu = <T,>({ innerProps, ...props }: MenuProps<T>) => (
  <components.Menu
    {...props}
    innerProps={{
      ...innerProps,
      onWheel: (event) => event.stopPropagation(),
      onTouchMove: (event) => event.stopPropagation()
    }}
  />
);
