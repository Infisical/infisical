import { ComponentProps } from "react";

import { DropdownMenuItem, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

type Props = Omit<ComponentProps<typeof DropdownMenuItem>, "isDisabled" | "isDisabledFocusable"> & {
  disabledReason?: string;
};

// A disabled item stays focusable so the tooltip can still open on hover and keyboard focus.
export const DisabledReasonMenuItem = ({ disabledReason, children, ...props }: Props) => (
  <Tooltip open={disabledReason ? undefined : false}>
    <TooltipTrigger asChild>
      <DropdownMenuItem
        {...props}
        isDisabled={Boolean(disabledReason)}
        isDisabledFocusable={Boolean(disabledReason)}
      >
        {children}
      </DropdownMenuItem>
    </TooltipTrigger>
    <TooltipContent side="left">{disabledReason}</TooltipContent>
  </Tooltip>
);
