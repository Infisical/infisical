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
  arrowClassName?: string;
  hideCloseBtn?: boolean;
} & PopoverPrimitive.PopoverContentProps;

export const PopoverContent = ({
  children,
  className,
  hideCloseBtn,
  arrowClassName,
  ...props
}: PopoverContentProps) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      className={twMerge(
        [
          "z-100 bg-mineshaft-600 fill-mineshaft-600 font-inter relative w-64 rounded-md p-4 pt-6 text-gray-200 shadow-md",
          // animation
          "data-[state=open]:data-[side=bottom]:animate-slide-up-and-fade",
          "data-[state=open]:data-[side=top]:animate-slide-down-and-fade",
          "data-[state=open]:data-[side=left]:animate-slide-right-and-fade",
          "data-[state=open]:data-[side=right]:animate-slide-left-and-fade"
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
            className="text-bunker-400 hover:text-bunker-50 absolute right-1 top-0 rounded-sm"
          >
            <FontAwesomeIcon icon={faTimes} size="lg" className="cursor-pointer" />
          </IconButton>
        </PopoverPrimitive.Close>
      )}
      <div className="pointer-events-none">
        <PopoverPrimitive.Arrow className={twMerge("fill-inherit", arrowClassName)} />
      </div>
    </PopoverPrimitive.Content>
  </PopoverPrimitive.Portal>
);
