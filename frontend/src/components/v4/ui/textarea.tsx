import * as React from "react";

import { useFieldControlAttributes } from "../lib/field-context";
import { cn } from "../lib/utils";

import controlStyles from "./controls.module.css";

function Textarea({
  className,
  mono = false,
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
      className={cn(controlStyles.field, controlStyles.textarea, "flex w-full", className)}
      {...props}
      {...fieldAttributes}
    />
  );
}
Textarea.displayName = "Textarea";

export { Textarea };
