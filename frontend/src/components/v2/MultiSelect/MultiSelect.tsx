import Select, {
  ClearIndicatorProps,
  components,
  DropdownIndicatorProps,
  MultiValueRemoveProps,
  OptionProps,
  Props
} from "react-select";
import { faCheckCircle, faCircleXmark } from "@fortawesome/free-regular-svg-icons";
import { faChevronDown, faX } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

const DropdownIndicator = (props: DropdownIndicatorProps) => {
  return (
    <components.DropdownIndicator {...props}>
      <FontAwesomeIcon icon={faChevronDown} size="xs" />
    </components.DropdownIndicator>
  );
};

const ClearIndicator = (props: ClearIndicatorProps) => {
  return (
    <components.ClearIndicator {...props}>
      <FontAwesomeIcon icon={faCircleXmark} />
    </components.ClearIndicator>
  );
};

const MultiValueRemove = (props: MultiValueRemoveProps) => {
  return (
    <components.MultiValueRemove {...props}>
      <FontAwesomeIcon icon={faX} size="xs" />
    </components.MultiValueRemove>
  );
};

const Option = ({ isSelected, children, ...props }: OptionProps) => {
  return (
    <components.Option isSelected={isSelected} {...props}>
      {children}
      {isSelected && (
        <FontAwesomeIcon className="ml-2 text-primary" icon={faCheckCircle} size="sm" />
      )}
    </components.Option>
  );
};

export const MultiSelect = (props: Props) => (
  <Select
    isMulti
    closeMenuOnSelect={false}
    hideSelectedOptions={false}
    unstyled
    styles={{
      input: (base) => ({
        ...base,
        "input:focus": {
          boxShadow: "none"
        }
      }),
      multiValueLabel: (base) => ({
        ...base,
        whiteSpace: "normal",
        overflow: "visible"
      }),
      control: (base) => ({
        ...base,
        transition: "none"
      })
    }}
    components={{ DropdownIndicator, ClearIndicator, MultiValueRemove, Option }}
    classNames={{
      container: () => "w-full font-inter",
      control: ({ isFocused }) =>
        twMerge(
          isFocused ? "border-primary-400/50" : "border-mineshaft-600 hover:border-gray-400",
          "border w-full p-0.5 rounded-md font-inter bg-mineshaft-900 hover:cursor-pointer"
        ),
      placeholder: () => "text-mineshaft-400 text-sm pl-1 py-0.5",
      input: () => "pl-1 py-0.5",
      valueContainer: () => "p-1 max-h-[14rem] !overflow-y-scroll gap-1",
      singleValue: () => "leading-7 ml-1",
      multiValue: () => "bg-mineshaft-600 rounded items-center py-0.5 px-2 gap-1.5",
      multiValueLabel: () => "leading-6 text-sm",
      multiValueRemove: () => "hover:text-red text-bunker-400",
      indicatorsContainer: () => "p-1 gap-1",
      clearIndicator: () => "p-1 hover:text-red text-bunker-400",
      indicatorSeparator: () => "bg-bunker-400",
      dropdownIndicator: () => "text-bunker-200 p-1",
      menu: () =>
        "mt-2 border text-sm text-mineshaft-200 bg-mineshaft-900 border-mineshaft-600 rounded-md",
      groupHeading: () => "ml-3 mt-2 mb-1 text-mineshaft-400 text-sm",
      option: ({ isFocused, isSelected }) =>
        twMerge(
          isFocused && "bg-mineshaft-700 active:bg-mineshaft-600",
          isSelected && "text-mineshaft-400",
          "hover:cursor-pointer text-xs px-3 py-2"
        ),
      noOptionsMessage: () => "text-mineshaft-400 p-2 rounded-md"
    }}
    {...props}
  />
);
