import { ReactNode } from "react";
import { faTimes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { twMerge } from "tailwind-merge";

import { IconButton } from "../IconButton";

export const PopoverTrigger = PopoverPrimitive.Trigger;

export const Popover = PopoverPrimitive.Root;

export type PopoverContentProps = {
  children?: ReactNode;
  hideCloseBtn?: boolean;
} & PopoverPrimitive.PopoverContentProps;

export const PopoverContent = ({
  children,
  className,
  hideCloseBtn,
  ...props
}: PopoverContentProps) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      className={twMerge(
        [
          "relative z-[100] w-64 rounded-md bg-mineshaft-600 fill-mineshaft-600 p-4 pt-6 font-inter text-gray-200 shadow-md",
          // animation
          "data-[state=open]:data-[side=bottom]:animate-slideUpAndFade",
          "data-[state=open]:data-[side=top]:animate-slideDownAndFade",
          "data-[state=open]:data-[side=left]:animate-slideRightAndFade",
          "data-[state=open]:data-[side=right]:animate-slideLeftAndFade"
        ],
        className
      )}
      {...props}
    >
      {children}
      {!hideCloseBtn && (
        <PopoverPrimitive.Close aria-label="Close" asChild>
          <IconButton
            variant="plain"
            ariaLabel="close"
            className="absolute top-0 right-1 rounded text-bunker-400 hover:text-bunker-50"
          >
            <FontAwesomeIcon icon={faTimes} size="lg" className="cursor-pointer" />
          </IconButton>
        </PopoverPrimitive.Close>
      )}
      <PopoverPrimitive.Arrow className="fill-inherit" />
    </PopoverPrimitive.Content>
  </PopoverPrimitive.Portal>
);
