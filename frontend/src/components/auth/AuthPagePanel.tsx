import { ComponentProps } from "react";

import { Card } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

type AuthPagePanelProps = ComponentProps<typeof Card>;

export const AuthPagePanel = ({ className, ...props }: AuthPagePanelProps) => (
  <Card
    className={cn(
      "mx-auto w-full max-w-none items-stretch gap-0 border-0 bg-transparent p-0 shadow-none",
      className
    )}
    {...props}
  />
);
