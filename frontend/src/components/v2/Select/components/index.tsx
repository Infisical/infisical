import {
  ClearIndicatorProps,
  components,
  DropdownIndicatorProps,
  GroupProps,
  MultiValueRemoveProps,
  OptionProps
} from "react-select";
import { faCheckCircle, faCircleXmark } from "@fortawesome/free-regular-svg-icons";
import { faChevronDown, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

export const DropdownIndicator = <T,>(props: DropdownIndicatorProps<T>) => {
  return (
    <components.DropdownIndicator {...props}>
      <FontAwesomeIcon icon={faChevronDown} size="xs" />
    </components.DropdownIndicator>
  );
};

export const ClearIndicator = <T,>(props: ClearIndicatorProps<T>) => {
  return (
    <components.ClearIndicator {...props}>
      <FontAwesomeIcon icon={faCircleXmark} />
    </components.ClearIndicator>
  );
};

export const MultiValueRemove = (props: MultiValueRemoveProps) => {
  return (
    <components.MultiValueRemove {...props}>
      <FontAwesomeIcon icon={faXmark} size="xs" />
    </components.MultiValueRemove>
  );
};

export const Option = <T,>({ isSelected, children, ...props }: OptionProps<T>) => {
  return (
    <components.Option isSelected={isSelected} {...props}>
      <div className="flex flex-row items-center justify-between">
        <p className="truncate">{children}</p>
        {isSelected && (
          <FontAwesomeIcon className="ml-2 text-primary" icon={faCheckCircle} size="sm" />
        )}
      </div>
    </components.Option>
  );
};

export const Group = <T,>(props: GroupProps<T>) => {
  return <components.Group {...props} />;
};
