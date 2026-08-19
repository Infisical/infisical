import { GroupBase } from "react-select";
import ReactSelectCreatable, { CreatableProps } from "react-select/creatable";

import { ClearIndicator, DropdownIndicator, Menu, MultiValueRemove, Option } from "./components";
import { getSelectClassNames, selectClassNames, selectStyles } from "./styles";

export const CreatableSelect = <T,>({
  isMulti,
  closeMenuOnSelect,
  isError,
  components,
  menuPortalTarget = typeof document === "undefined" ? undefined : document.body,
  menuPosition = "fixed",
  ...props
}: CreatableProps<T, boolean, GroupBase<T>> & { isError?: boolean }) => {
  return (
    <ReactSelectCreatable
      isMulti={isMulti}
      closeMenuOnSelect={closeMenuOnSelect ?? !isMulti}
      hideSelectedOptions={false}
      unstyled
      data-slot="creatable-select"
      menuPortalTarget={menuPortalTarget}
      menuPosition={menuPosition}
      styles={selectStyles as any}
      components={{
        DropdownIndicator,
        ClearIndicator,
        MultiValueRemove,
        Option,
        Menu,
        ...components
      }}
      classNames={(isError ? getSelectClassNames(isError) : selectClassNames) as any}
      {...props}
    />
  );
};
