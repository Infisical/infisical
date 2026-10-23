"use client";

import * as React from "react";
import { Collapsible as CollapsiblePrimitive } from "radix-ui";

function Collapsible({ ref, ...props }: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root ref={ref} data-slot="collapsible" {...props} />;
}
Collapsible.displayName = "Collapsible";

function CollapsibleTrigger({
  ref,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger ref={ref} data-slot="collapsible-trigger" {...props} />
  );
}
CollapsibleTrigger.displayName = "CollapsibleTrigger";

function CollapsibleContent({
  ref,
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return (
    <CollapsiblePrimitive.CollapsibleContent ref={ref} data-slot="collapsible-content" {...props} />
  );
}
CollapsibleContent.displayName = "CollapsibleContent";

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
