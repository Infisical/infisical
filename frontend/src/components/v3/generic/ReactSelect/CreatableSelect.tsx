import { GroupBase } from "react-select";
import ReactSelectCreatable, { CreatableProps } from "react-select/creatable";

import { ClearIndicator, DropdownIndicator, MultiValueRemove, Option } from "./components";
import { getSelectClassNames, selectClassNames, selectStyles } from "./styles";

export const CreatableSelect = <T,>({
  isMulti,
  closeMenuOnSelect,
  isError,
  ...props
}: CreatableProps<T, boolean, GroupBase<T>> & { isError?: boolean }) => {
  return (
    <ReactSelectCreatable
      isMulti={isMulti}
      closeMenuOnSelect={closeMenuOnSelect ?? !isMulti}
      hideSelectedOptions={false}
      unstyled
      data-slot="creatable-select"
      styles={selectStyles as any}
      components={{ DropdownIndicator, ClearIndicator, MultiValueRemove, Option }}
      classNames={(isError ? getSelectClassNames(isError) : selectClassNames) as any}
      {...props}
    />
  );
};
