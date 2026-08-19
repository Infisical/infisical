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
            isFocused ? "border-project/50" : "border-border hover:border-foreground/20",
            "w-full rounded-md border bg-card p-0.5 font-inter text-foreground hover:cursor-pointer"
          ),
        placeholder: () => "text-muted text-sm pl-1 py-0.5",
        input: () => "pl-1 py-0.5",
        valueContainer: () => `p-1 max-h-56 ${isMulti ? "overflow-y-auto!" : ""} gap-1`,
        singleValue: () => "leading-7 ml-1",
        multiValue: () => "bg-foreground/10 rounded-sm items-center py-0.5 px-2 gap-1.5",
        multiValueLabel: () => "leading-6 text-sm",
        multiValueRemove: () => "hover:text-danger text-muted",
        indicatorsContainer: () => "p-1 gap-1",
        clearIndicator: () => "p-1 hover:text-danger text-muted",
        indicatorSeparator: () => "bg-muted",
        dropdownIndicator: () => "text-foreground p-1",
        menu: () => "mt-2 border text-sm text-foreground bg-popover border-border rounded-md",
        groupHeading: () => "ml-3 mt-2 mb-1 text-muted text-sm",
        option: ({ isFocused, isSelected }) =>
          twMerge(
            isFocused && "bg-container-hover active:bg-foreground/10",
            isSelected && "text-foreground",
            "px-3 py-2 text-xs hover:cursor-pointer"
          ),
        noOptionsMessage: () => "text-muted p-2 rounded-md",
        loadingMessage: () => "text-muted p-2 rounded-md"
      }}
      {...props}
    />
  );
};
