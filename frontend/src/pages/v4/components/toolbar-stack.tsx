import type { ComponentProps } from "react";
import { Stack } from "@infisical/cipher/ui/layout";

export const ToolbarStack = ({ style, ...props }: Omit<ComponentProps<typeof Stack>, "gap">) => (
  <Stack style={{ gap: "var(--cipher-space-toolbar-gap)", ...style }} {...props} />
);
