import * as React from "react";
import { CheckIcon } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";

import { cn } from "@app/components/v4/lib/utils";

function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "peer relative flex size-4 shrink-0 items-center justify-center rounded-v4-xs border border-v4-control transition-colors outline-none group-has-disabled/field:opacity-50 group-has-[:focus-visible]/field-label:outline-0 group-has-[:focus-visible]/field-label:not-data-[state=checked]:border-v4-control after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-v4-ink focus-visible:outline-solid disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-v4-bad aria-invalid:aria-checked:border-primary data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-v4-on-ink group-has-[:focus-visible]/field-label:data-[state=checked]:border-primary dark:bg-v4-control/30 dark:aria-invalid:border-v4-bad/50 dark:data-[state=checked]:bg-primary",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3.5"
      >
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
