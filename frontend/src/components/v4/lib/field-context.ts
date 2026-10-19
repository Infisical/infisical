import * as React from "react";

export type FieldControlAttributes = Pick<
  React.AriaAttributes,
  "aria-describedby" | "aria-invalid" | "aria-labelledby"
> & { id?: string };
export const FieldControlContext = React.createContext<FieldControlAttributes>({});
export function useFieldControlAttributes(props: FieldControlAttributes): FieldControlAttributes {
  const field = React.useContext(FieldControlContext);
  return {
    id: props.id ?? field.id,
    "aria-labelledby": props["aria-labelledby"] ?? field["aria-labelledby"],
    "aria-invalid": field["aria-invalid"] || props["aria-invalid"],
    "aria-describedby":
      [field["aria-describedby"], props["aria-describedby"]].filter(Boolean).join(" ") || undefined
  };
}
