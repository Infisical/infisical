import { GroupBase } from "react-select";
import ReactSelectCreatable, { CreatableProps } from "react-select/creatable";

import { usePortalContainer } from "@app/components/overlays/OverlayLayer";

import {
  ClearIndicator,
  DropdownIndicator,
  MenuList,
  MultiValueRemove,
  Option
} from "./components";
import { getSelectClassNames, selectClassNames, selectStyles } from "./styles";

export const CreatableSelect = <T,>({
  isMulti,
  closeMenuOnSelect,
  isError,
  components,
  menuPortalTarget,
  menuIsOpen,
  menuPosition = "fixed",
  ...props
}: CreatableProps<T, boolean, GroupBase<T>> & { isError?: boolean }) => {
  const layerContainer = usePortalContainer();
  return (
    <ReactSelectCreatable
      isMulti={isMulti}
      closeMenuOnSelect={closeMenuOnSelect ?? !isMulti}
      hideSelectedOptions={false}
      unstyled
      data-slot="creatable-select"
      menuPortalTarget={
        menuPortalTarget === undefined
          ? (layerContainer ?? (typeof document === "undefined" ? undefined : document.body))
          : menuPortalTarget
      }
      menuIsOpen={layerContainer === null && menuPortalTarget === undefined ? false : menuIsOpen}
      menuPosition={menuPosition}
      styles={selectStyles as any}
      components={{
        DropdownIndicator,
        ClearIndicator,
        MenuList,
        MultiValueRemove,
        Option,
        ...components
      }}
      classNames={(isError ? getSelectClassNames(isError) : selectClassNames) as any}
      {...props}
    />
  );
};
