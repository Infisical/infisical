/* eslint-disable react/prop-types */

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva, VariantProps } from "cva";

import { cn } from "@app/components/v3/utils";

const tabsVariants = cva("flex gap-2 [&_svg]:mb-0.5", {
  variants: {
    variant: {
      "secret-manager": "[--active-border:theme(colors.secret-manager)]",
      "secret-scanning": "[--active-border:theme(colors.secret-scanning)]",
      "cert-manager": "[--active-border:theme(colors.cert-manager)]",
      ssh: "[--active-border:theme(colors.ssh)]",
      pam: "[--active-border:theme(colors.pam)]",
      kms: "[--active-border:theme(colors.kms)]",
      org: "[--active-border:theme(colors.org)]",
      namespace: "[--active-border:theme(colors.namespace)]",
      ghost: "[&_button]:border-b-0"
    },
    orientation: {
      vertical: "[&>div]:flex-col [&>div]:items-start",
      horizontal: "flex-col" // this is the positioning of the tab content relative to the tabs, not the tab orientation
    }
  },
  defaultVariants: {
    variant: "org"
  }
});

type TabsProps = React.ComponentProps<typeof TabsPrimitive.Root> &
  VariantProps<typeof tabsVariants>;

function Tabs({ className, variant, orientation, ...props }: TabsProps) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      orientation={orientation}
      className={cn(tabsVariants({ variant, orientation }), className)}
      {...props}
    />
  );
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn("inline-flex w-fit items-end justify-center", className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "inline-flex flex-1 items-center justify-center gap-x-2 whitespace-nowrap px-3 pb-1.5 pt-2",
        "border-b-2 border-transparent text-sm text-foreground/75 hover:text-foreground/90",
        "data-[state=active]:border-[var(--active-border)] data-[state=active]:text-foreground",
        "disabled:pointer-events-none disabled:opacity-50",
        "[&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, type TabsProps, TabsTrigger };
