/* eslint-disable react/prop-types */

import * as React from "react";

import { cn } from "../../utils";

function UnstableCard({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn("flex h-fit flex-col gap-6 rounded-[6px] text-foreground shadow-sm", className)}
      {...props}
    />
  );
}

function UnstableCardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-center gap-1 border-mineshaft-400/60 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  );
}

function UnstableCardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "flex items-center gap-1.5 leading-none font-semibold [&>svg]:inline-block [&>svg]:size-[18px]",
        className
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn(
        "flex items-center gap-1 text-sm text-accent [&>svg]:inline-block [&>svg]:size-[12px]",
        className
      )}
      {...props}
    />
  );
}

function UnstableCardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  );
}

function UnstableCardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("", className)} {...props} />;
}

function UnstableCardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center border-border [.border-t]:pt-6", className)}
      {...props}
    />
  );
}

export {
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  CardDescription as UnstableCardDescription,
  UnstableCardFooter,
  UnstableCardHeader,
  UnstableCardTitle
};
