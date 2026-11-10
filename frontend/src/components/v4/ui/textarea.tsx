import * as React from "react";

import { useFieldControlAttributes } from "../lib/field-context";
import { cn } from "../lib/utils";

import controlStyles from "./controls.module.css";

function Textarea({
  className,
  mono = false,
  rows,
  style,
  ref,
  ...props
}: React.ComponentProps<"textarea"> & { mono?: boolean }) {
  const fieldAttributes = useFieldControlAttributes(props);
  return (
    <textarea
      ref={ref}
      data-slot="textarea"
      data-size="sm"
      data-mono={mono || undefined}
      data-rows={rows === undefined ? undefined : ""}
      rows={rows}
      style={
        rows === undefined
          ? style
          : ({ ...style, "--v4-textarea-rows": rows } as React.CSSProperties)
      }
      className={cn(controlStyles.field, controlStyles.textarea, "flex w-full", className)}
      {...props}
      {...fieldAttributes}
    />
  );
}
Textarea.displayName = "Textarea";

export { Textarea };
