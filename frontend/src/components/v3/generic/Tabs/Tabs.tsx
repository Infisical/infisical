/* eslint-disable react/prop-types */

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva, type VariantProps } from "cva";

import { cn } from "../../utils";

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      orientation={orientation}
      className={cn("group/tabs flex gap-2 data-[orientation=horizontal]:flex-col", className)}
      {...props}
    />
  );
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-md p-[3px] text-muted-foreground group-data-[orientation=horizontal]/tabs:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[style=underline]:rounded-none",
  {
    variants: {
      variant: {
        filled: "border p-1 border-border",
        project:
          "bg-transparent group-data-[orientation=horizontal]/tabs:h-11 group-data-[orientation=horizontal]/tabs:border-b group-data-[orientation=horizontal]/tabs:border-border group-data-[orientation=vertical]/tabs:gap-2",
        org: "bg-transparent group-data-[orientation=horizontal]/tabs:h-11 group-data-[orientation=horizontal]/tabs:border-b group-data-[orientation=horizontal]/tabs:border-border group-data-[orientation=vertical]/tabs:gap-2",
        "sub-org":
          "bg-transparent group-data-[orientation=horizontal]/tabs:h-11 group-data-[orientation=horizontal]/tabs:border-b group-data-[orientation=horizontal]/tabs:border-border group-data-[orientation=vertical]/tabs:gap-2",
        admin:
          "bg-transparent group-data-[orientation=horizontal]/tabs:h-11 group-data-[orientation=horizontal]/tabs:border-b group-data-[orientation=horizontal]/tabs:border-border group-data-[orientation=vertical]/tabs:gap-2"
      }
    },
    defaultVariants: {
      variant: "filled"
    }
  }
);

const STYLE_BY_VARIANT = {
  filled: "filled",
  project: "underline",
  org: "underline",
  "sub-org": "underline",
  admin: "underline"
} as const;

function TabsList({
  className,
  variant = "filled",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      data-style={STYLE_BY_VARIANT[variant ?? "filled"]}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-[calc(100%-1px)] flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-transparent",
        "px-1.5 py-0.5 text-sm whitespace-nowrap text-foreground/60 transition-all group-data-[orientation=vertical]/tabs:w-full",
        "group-data-[orientation=vertical]/tabs:px-2 group-data-[orientation=vertical]/tabs:py-1.5",
        "group-data-[orientation=horizontal]/tabs:group-data-[style=underline]/tabs-list:px-3",
        "group-data-[orientation=horizontal]/tabs:group-data-[style=filled]/tabs-list:px-3 group-data-[orientation=horizontal]/tabs:group-data-[style=filled]/tabs-list:py-0.5",
        "group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px]",
        "focus-visible:ring-ring/50 focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50",
        "has-data-[icon=inline-end]:pr-1 has-data-[icon=inline-start]:pl-1 [&_svg]:pointer-events-none",
        "group-data-[style=underline]/tabs-list:bg-transparent [&_svg]:shrink-0",
        "[&_svg:not([class*='size-'])]:size-4",
        "data-[state=active]:text-foreground",
        "group-data-[style=filled]/tabs-list:data-[state=active]:border-container-hover group-data-[style=filled]/tabs-list:data-[state=active]:bg-container-hover",
        "after:absolute after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0",
        "group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.25",
        "group-data-[orientation=horizontal]/tabs:group-data-[style=underline]/tabs-list:after:bottom-[-5.6px]",
        "group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-left-1",
        "group-data-[orientation=vertical]/tabs:after:w-0.25 group-data-[style=underline]/tabs-list:data-[state=active]:after:opacity-100",
        "group-data-[variant=project]/tabs-list:after:bg-project",
        "group-data-[variant=org]/tabs-list:after:bg-org",
        "group-data-[variant=sub-org]/tabs-list:after:bg-sub-org",
        "group-data-[variant=admin]/tabs-list:after:bg-admin",
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
      className={cn("flex-1 text-sm text-foreground outline-none", className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, tabsListVariants, TabsTrigger };
