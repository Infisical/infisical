import { ComponentProps, ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

type Props = {
  disabledReason?: string;
  side?: ComponentProps<typeof TooltipContent>["side"];
  contentClassName?: string;
  children: ReactNode;
};

// A disabled button takes no pointer or focus events, so a focusable wrapper carries the tooltip that says why. The
// button inside sets its own isDisabled from the same reason.
export const DisabledReasonTooltip = ({
  disabledReason,
  side,
  contentClassName,
  children
}: Props) => {
  if (!disabledReason) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the wrapper has to take focus so keyboard users can read why the button inside is disabled */}
        <span tabIndex={0} className="inline-flex cursor-not-allowed">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent side={side} className={contentClassName}>
        {disabledReason}
      </TooltipContent>
    </Tooltip>
  );
};

// The reason a disabled action shows, or undefined when the caller may take it.
export const deniedReason = (isAllowed: boolean, reason: string) =>
  isAllowed ? undefined : reason;
