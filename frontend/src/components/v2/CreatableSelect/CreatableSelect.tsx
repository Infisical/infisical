import { GroupBase } from "react-select";
import ReactSelectCreatable, { CreatableProps } from "react-select/creatable";
import { twMerge } from "tailwind-merge";

import { ClearIndicator, DropdownIndicator, MultiValueRemove, Option } from "../Select/components";

export const CreatableSelect = <T,>({
  isMulti,
  closeMenuOnSelect,
  ...props
}: CreatableProps<T, boolean, GroupBase<T>>) => {
  return (
    <ReactSelectCreatable
      isMulti={isMulti}
      closeMenuOnSelect={closeMenuOnSelect ?? !isMulti}
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
            "w-full rounded-md border bg-mineshaft-900 p-0.5 font-inter text-mineshaft-200 hover:cursor-pointer"
          ),
        placeholder: () => "text-mineshaft-400 text-sm pl-1 py-0.5",
        input: () => "pl-1 py-0.5",
        valueContainer: () => `p-1 max-h-[14rem] ${isMulti ? "!overflow-y-scroll" : ""} gap-1`,
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
            isSelected && "text-mineshaft-200",
            "px-3 py-2 text-xs hover:cursor-pointer"
          ),
        noOptionsMessage: () => "text-mineshaft-400 p-2 rounded-md"
      }}
      {...props}
    />
  );
};
