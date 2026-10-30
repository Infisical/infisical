import * as React from "react";
import { ChevronsUpDown } from "lucide-react";

import { IconButton, Popover, PopoverContent, PopoverTrigger } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

const NavbarBlock = ({ className, ...props }: React.ComponentProps<"div">) => (
  <div
    className={cn(
      "flex h-full min-w-0 items-center gap-1 border-border-soft pr-2 pl-4 not-first:border-l",
      className
    )}
    {...props}
  />
);

const NavbarSwitcher = (props: React.ComponentProps<typeof Popover>) => <Popover {...props} />;

type NavbarSwitcherTriggerProps = Omit<React.ComponentProps<"button">, "children"> & {
  "aria-label": string;
};

const NavbarSwitcherTrigger = (props: NavbarSwitcherTriggerProps) => (
  <PopoverTrigger asChild>
    <IconButton variant="ghost" size="xs" {...props}>
      <ChevronsUpDown />
    </IconButton>
  </PopoverTrigger>
);

type NavbarSwitcherContentProps = Omit<
  React.ComponentProps<typeof PopoverContent>,
  "align" | "sideOffset"
>;

const NavbarSwitcherContent = ({ className, ...props }: NavbarSwitcherContentProps) => (
  <PopoverContent align="start" className={cn("p-0", className)} {...props} />
);

export { NavbarBlock, NavbarSwitcher, NavbarSwitcherContent, NavbarSwitcherTrigger };
