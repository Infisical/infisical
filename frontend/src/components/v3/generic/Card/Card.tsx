/* eslint-disable react/prop-types */

import * as React from "react";

import { cn } from "../../utils";

function UnstableCard({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "flex h-fit flex-col gap-5 rounded-md border border-border bg-card p-5 text-foreground shadow-sm",
        className
      )}
      {...props}
    />
  );
}

function UnstableCardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-center gap-1",
        "border-border has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
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
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-description" className={cn("text-sm text-accent", className)} {...props} />
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
