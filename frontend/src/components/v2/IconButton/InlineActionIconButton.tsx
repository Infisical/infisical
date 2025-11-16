import { forwardRef, MouseEventHandler } from "react";
import { IconProp } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ReactNode } from "@tanstack/react-router";
import clsx from "clsx";

import { Tooltip } from "../Tooltip";
import { IconButton } from "./IconButton";

interface InlineActionIconButtonProps {
  className?: string;
  onClick?: MouseEventHandler;
  type?: "submit" | "button";
  icon: IconProp;
  hint: ReactNode;
  isDisabled?: boolean;
  revealOnGroupHover?: boolean;
  isHidden?: boolean;
}

export const InlineActionIconButton = forwardRef<HTMLButtonElement, InlineActionIconButtonProps>(
  (
    {
      className,
      hint,
      icon,
      type = "button",
      onClick,
      isDisabled,
      isHidden,
      revealOnGroupHover
    }: InlineActionIconButtonProps,
    ref
  ) => {
    return (
      <Tooltip content={hint}>
        <IconButton
          ref={ref}
          variant="plain"
          ariaLabel={hint}
          data-reveal={revealOnGroupHover}
          data-hidden={isHidden}
          className="h-full data-[hidden=true]:hidden data-[reveal=true]:opacity-0 data-[reveal=true]:group-hover:opacity-100"
          isDisabled={isDisabled}
          onClick={onClick}
          type={type}
        >
          <FontAwesomeIcon icon={icon} className={clsx("h-3.5 w-3", className)} />
        </IconButton>
      </Tooltip>
    );
  }
);
