/* eslint-disable react/prop-types */

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva, VariantProps } from "cva";

import { cn } from "@app/components/v3/utils";

const tabsVariants = cva("flex flex-col gap-2", {
  variants: {
    variant: {
      "secret-manager": "[--active-border:theme(colors.secret-manager)]",
      "secret-scanning": "[--active-border:theme(colors.secret-scanning)]",
      "cert-manager": "[--active-border:theme(colors.cert-manager)]",
      ssh: "[--active-border:theme(colors.ssh)]",
      pam: "[--active-border:theme(colors.pam)]",
      kms: "[--active-border:theme(colors.kms)]",
      org: "[--active-border:theme(colors.org)]",
      namespace: "[--active-border:theme(colors.namespace)]"
    }
  },
  defaultVariants: {
    variant: "org"
  }
});

type TabsProps = React.ComponentProps<typeof TabsPrimitive.Root> &
  VariantProps<typeof tabsVariants>;

function Tabs({ className, variant, ...props }: TabsProps) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn(tabsVariants({ variant }), className)}
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
        "inline-flex flex-1 items-center justify-center whitespace-nowrap px-3 pb-0.5",
        "border-b-2 border-transparent text-sm text-foreground/75",
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
