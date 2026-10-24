import * as React from "react";

import { useFieldControlAttributes } from "../lib/field-context";
import { cn } from "../lib/utils";

import controlStyles from "./controls.module.css";

function Textarea({ className, ref, ...props }: React.ComponentProps<"textarea">) {
  const fieldAttributes = useFieldControlAttributes(props);
  return (
    <textarea
      ref={ref}
      data-slot="textarea"
      data-size="sm"
      className={cn(controlStyles.field, controlStyles.textarea, "flex w-full", className)}
      {...props}
      {...fieldAttributes}
    />
  );
}
Textarea.displayName = "Textarea";

export { Textarea };
