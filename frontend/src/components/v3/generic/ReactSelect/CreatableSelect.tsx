import { GroupBase } from "react-select";
import ReactSelectCreatable, { CreatableProps } from "react-select/creatable";

import { ClearIndicator, DropdownIndicator, MultiValueRemove, Option } from "./components";
import { selectClassNames, selectStyles } from "./styles";

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
      data-slot="creatable-select"
      styles={selectStyles as any}
      components={{ DropdownIndicator, ClearIndicator, MultiValueRemove, Option }}
      classNames={selectClassNames as any}
      {...props}
    />
  );
};
