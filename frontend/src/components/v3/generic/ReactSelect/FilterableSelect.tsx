import Select, { GroupBase, Props } from "react-select";

import { ClearIndicator, DropdownIndicator, Group, MultiValueRemove, Option } from "./components";
import { getSelectClassNames, selectClassNames, selectStyles } from "./styles";

/**
 * @deprecated Migrate searchable single- and multi-select callsites to `Combobox` when its
 * contract fits. Creatable, grouped, and advanced compatibility consumers remain supported.
 */
export const FilterableSelect = <T,>({
  isMulti,
  closeMenuOnSelect,
  tabSelectsValue = false,
  groupBy = null,
  getGroupHeaderLabel = null,
  options = [],
  isError,
  components,
  menuPortalTarget = typeof document === "undefined" ? undefined : document.body,
  menuPosition = "fixed",
  ...props
}: Props<T, boolean, GroupBase<T>> & {
  groupBy?: string | null;
  getGroupHeaderLabel?: ((groupValue: any) => string) | null;
  isError?: boolean;
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
      menuPortalTarget={menuPortalTarget}
      menuPosition={menuPosition}
      styles={selectStyles as any}
      components={{
        DropdownIndicator,
        ClearIndicator,
        MultiValueRemove,
        Option,
        Group,
        ...components
      }}
      classNames={(isError ? getSelectClassNames(isError) : selectClassNames) as any}
      {...props}
    />
  );
};
