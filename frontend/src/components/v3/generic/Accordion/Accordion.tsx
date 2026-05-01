/* eslint-disable react/prop-types */

import * as React from "react";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { ChevronDownIcon } from "lucide-react";

import { cn } from "../../utils";

function Accordion({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Root> & {
  variant?: "default" | "ghost";
}) {
  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      data-variant={variant}
      className={cn(
        "group/accordion",
        variant === "default" &&
          "overflow-clip rounded-md border border-border bg-container text-foreground",
        variant === "ghost" && "text-foreground",
        className
      )}
      {...props}
    />
  );
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border-b border-border last:border-b-0", className)}
      {...props}
    />
  );
}

function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "flex flex-1 items-center border-border text-left text-sm font-medium",
          "transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          "disabled:pointer-events-none disabled:opacity-50",
          "cursor-pointer",
          // Default variant
          "group-data-[variant=default]/accordion:min-h-12 group-data-[variant=default]/accordion:gap-4 group-data-[variant=default]/accordion:bg-container group-data-[variant=default]/accordion:px-4",
          "group-data-[variant=default]/accordion:hover:bg-container-hover",
          "group-data-[variant=default]/accordion:data-[state=open]:bg-container-hover",
          "group-data-[variant=default]/accordion:[&[data-state=open]>[data-slot=accordion-chevron]]:rotate-180",
          // Ghost variant
          "group-data-[variant=ghost]/accordion:min-h-10 group-data-[variant=ghost]/accordion:gap-2 group-data-[variant=ghost]/accordion:py-2",
          "group-data-[variant=ghost]/accordion:hover:text-foreground/80",
          "group-data-[variant=ghost]/accordion:[&[data-state=open]>[data-slot=accordion-chevron]]:rotate-180",
          className
        )}
        {...props}
      >
        <ChevronDownIcon
          data-slot="accordion-chevron"
          className={cn(
            "pointer-events-none shrink-0 text-label transition-transform duration-200",
            "group-data-[variant=default]/accordion:size-4",
            "group-data-[variant=ghost]/accordion:size-4"
          )}
        />
        {children}
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Content>) {
  return (
    <AccordionPrimitive.Content
      data-slot="accordion-content"
      className="overflow-hidden text-sm transition data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"
      {...props}
    >
      <div
        className={cn(
          "group-data-[variant=default]/accordion:p-6",
          "group-data-[variant=ghost]/accordion:pt-2 group-data-[variant=ghost]/accordion:pb-4",
          className
        )}
      >
        {children}
      </div>
    </AccordionPrimitive.Content>
  );
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger };
