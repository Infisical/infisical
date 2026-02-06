import Select, { GroupBase, Props } from "react-select";

import { ClearIndicator, DropdownIndicator, Group, MultiValueRemove, Option } from "./components";
import { selectClassNames, selectStyles } from "./styles";

export const FilterableSelect = <T,>({
  isMulti,
  closeMenuOnSelect,
  tabSelectsValue = false,
  groupBy = null,
  getGroupHeaderLabel = null,
  options = [],
  ...props
}: Props<T, boolean, GroupBase<T>> & {
  groupBy?: string | null;
  getGroupHeaderLabel?: ((groupValue: any) => string) | null;
}) => {
  let processedOptions: Props<T, boolean, GroupBase<T>>["options"] = options;

  if (groupBy && Array.isArray(options)) {
    const groupedOptions = options.reduce<Record<string, { label: string; options: T[] }>>(
      (acc, option) => {
        const groupValue = (option as Record<string, any>)[groupBy];
        const groupKey = groupValue?.toString() || "undefined";

        if (!acc[groupKey]) {
          acc[groupKey] = {
            label: getGroupHeaderLabel ? getGroupHeaderLabel(groupValue) : groupValue,
            options: []
          };
        }

        acc[groupKey].options.push(option);
        return acc;
      },
      {}
    );

    processedOptions = Object.values(groupedOptions);
  }

  return (
    <Select<T, boolean, GroupBase<T>>
      isMulti={isMulti}
      closeMenuOnSelect={closeMenuOnSelect ?? !isMulti}
      hideSelectedOptions={false}
      unstyled
      options={processedOptions}
      tabSelectsValue={tabSelectsValue}
      styles={selectStyles as any}
      components={{
        DropdownIndicator,
        ClearIndicator,
        MultiValueRemove,
        Option,
        Group,
        ...props.components
      }}
      classNames={selectClassNames as any}
      {...props}
    />
  );
};
