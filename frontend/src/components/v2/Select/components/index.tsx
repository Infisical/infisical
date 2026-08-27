import {
  ClearIndicatorProps,
  components,
  DropdownIndicatorProps,
  GroupBase,
  GroupProps,
  MenuListProps,
  MultiValueRemoveProps,
  OptionProps
} from "react-select";
import { faCheckCircle, faCircleXmark } from "@fortawesome/free-regular-svg-icons";
import { faChevronDown, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

const isOptionGroup = <T,>(option: T | GroupBase<T>): option is GroupBase<T> =>
  option != null &&
  typeof option === "object" &&
  "options" in option &&
  Array.isArray((option as GroupBase<T>).options);

const flattenOptions = <T,>(options: readonly (T | GroupBase<T>)[]): T[] =>
  options.flatMap((option) => (isOptionGroup(option) ? option.options : [option]));

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

export const MenuList = <T,>(props: MenuListProps<T, boolean>) => {
  const { children, isMulti, options, getValue, setValue, clearValue, selectProps } = props;
  const allOptions = flattenOptions((options ?? []) as (T | GroupBase<T>)[]);
  const selected = getValue();
  const { getOptionValue } = selectProps;
  const allSelected =
    isMulti &&
    allOptions.length > 0 &&
    selected.length === allOptions.length &&
    allOptions.every((option) =>
      selected.some((value) => getOptionValue(value) === getOptionValue(option))
    );

  return (
    <components.MenuList {...props}>
      {isMulti && allOptions.length > 0 && (
        <div className="mb-1 border-b border-mineshaft-600">
          <button
            type="button"
            className="flex w-full cursor-pointer flex-row items-center justify-between rounded-sm px-3 py-2 text-left font-inter text-sm font-normal text-mineshaft-200 hover:bg-mineshaft-700"
            onMouseDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
            }}
            onClick={() => {
              if (allSelected) {
                clearValue();
              } else {
                setValue(allOptions, "select-option");
              }
            }}
          >
            <p className="truncate">{allSelected ? "Clear" : "Select All"}</p>
            {allSelected && (
              <FontAwesomeIcon className="ml-2 text-primary" icon={faCheckCircle} size="sm" />
            )}
          </button>
        </div>
      )}
      {children}
    </components.MenuList>
  );
};
