"use client";

import * as React from "react";
import { AspectRatio as AspectRatioPrimitive } from "radix-ui";

const AspectRatio = React.forwardRef<
  React.ComponentRef<typeof AspectRatioPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AspectRatioPrimitive.Root>
>(({ ...props }, ref) => {
  return <AspectRatioPrimitive.Root ref={ref} data-slot="aspect-ratio" {...props} />;
});
AspectRatio.displayName = "AspectRatio";

export { AspectRatio };
