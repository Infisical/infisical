import { FontAwesomeSpriteName } from "@app/pages/secret-manager/SecretDashboardPage/components/SecretListView/SecretListView.utils";
import { IconButton } from "./IconButton";
import { Tooltip } from "../Tooltip";
import { forwardRef, MouseEventHandler } from "react";
import { FontAwesomeSymbol } from "../FontAwesomeSymbol";
import clsx from "clsx";
import { ReactNode } from "@tanstack/react-router";

interface InlineActionIconButtonProps {
  className?: string;
  onClick?: MouseEventHandler;
  type?: "submit" | "button";
  icon: FontAwesomeSpriteName;
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
          <FontAwesomeSymbol className={clsx("h-3.5 w-3", className)} symbolName={icon} />
        </IconButton>
      </Tooltip>
    );
  }
);
