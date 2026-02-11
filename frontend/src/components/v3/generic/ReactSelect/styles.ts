import { ClassNamesConfig, GroupBase, StylesConfig } from "react-select";

import { cn } from "../../utils";

export const selectClassNames: ClassNamesConfig<unknown, boolean, GroupBase<unknown>> = {
  control: ({ isFocused }) =>
    cn(
      "!min-h-9 w-full cursor-pointer rounded-md border bg-transparent py-1 pr-1 pl-2 text-sm",
      isFocused ? "border-ring ring-[3px] ring-ring/50" : "border-border hover:border-foreground/20"
    ),
  placeholder: () => "text-muted text-sm",
  input: () => "text-foreground text-sm",
  valueContainer: () =>
    "gap-1 max-h-40 !pointer-events-auto !overflow-y-auto thin-scrollbar flex-wrap",
  multiValue: () => "bg-foreground/10 rounded px-1.5 py-0.5 gap-1 text-xs items-center",
  multiValueLabel: () => "text-foreground/85",
  multiValueRemove: () => "[&>svg]:size-3 hover:text-danger text-muted cursor-pointer ml-0.5",
  menu: () => "my-2 rounded-[6px] border border-border bg-popover p-1 shadow-md",
  menuList: () => "max-h-48 text-sm overflow-y-auto thin-scrollbar",
  option: ({ isFocused }) =>
    cn(
      "cursor-pointer rounded-sm px-2 py-1.5 text-sm text-foreground",
      isFocused && "bg-foreground/5"
    ),
  dropdownIndicator: () =>
    "opacity-50 p-1 hover:bg-foreground/10 cursor-pointer rounded-md [&>svg]:size-4",
  indicatorsContainer: () => "gap-1 flex items-center",
  indicatorSeparator: () => "bg-accent/20",
  clearIndicator: () =>
    "opacity-50 hover:opacity-100 hover:bg-foreground/10 cursor-pointer rounded-md p-1 text-danger [&>svg]:size-4",
  noOptionsMessage: () => "text-muted p-2 text-sm",
  loadingMessage: () => "text-muted p-2 text-sm"
};

export const selectStyles: StylesConfig<unknown, boolean, GroupBase<unknown>> = {
  control: (base) => ({ ...base, minHeight: "unset" }),
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
  menuPortal: (provided) => ({
    ...provided,
    zIndex: 99999
  })
};
