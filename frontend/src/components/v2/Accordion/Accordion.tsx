import { forwardRef } from "react";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { twMerge } from "tailwind-merge";

export const AccordionItem = forwardRef<HTMLDivElement, AccordionPrimitive.AccordionItemProps>(
  ({ children, className, ...props }, forwardedRef) => (
    <AccordionPrimitive.Item
      className={twMerge(
        "mt-px overflow-hidden first:mt-0 data-[state=open]:border-l data-[state=open]:border-primary transition-all border-transparent",
        className
      )}
      {...props}
      ref={forwardedRef}
    >
      {children}
    </AccordionPrimitive.Item>
  )
);
AccordionItem.displayName = "AccordionItem";

export const AccordionTrigger = forwardRef<
  HTMLButtonElement,
  AccordionPrimitive.AccordionTriggerProps
>(({ children, className, ...props }, forwardedRef) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      className={twMerge(
        "py-2 px-4 group data-[state=open]:text-primary h-11 hover:text-primary flex flex-1 outline-none items-center justify-between ",
        className
      )}
      {...props}
      ref={forwardedRef}
    >
      {children}
      <FontAwesomeIcon
        icon={faChevronDown}
        className="ease-[cubic-bezier(0.87,_0,_0.13,_1)] transition-transform duration-300 group-data-[state=open]:rotate-180 text-sm"
        aria-hidden
      />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));

AccordionTrigger.displayName = "AccordionTrigger";

export const AccordionContent = forwardRef<
  HTMLDivElement,
  AccordionPrimitive.AccordionContentProps
>(({ children, className, ...props }, forwardedRef) => (
  <AccordionPrimitive.Content
    className={twMerge(
      "data-[state=open]:animate-slideDown data-[state=closed]:animate-slideUp overflow-hidden",
      className
    )}
    {...props}
    ref={forwardedRef}
  >
    <div className="text-sm py-2 px-4">{children}</div>
  </AccordionPrimitive.Content>
));

AccordionContent.displayName = "AccordionContent";

// ref: https://www.radix-ui.com/primitives/docs/components/accordion#root
export const Accordion = ({
  children,
  ...props
}: AccordionPrimitive.AccordionSingleProps | AccordionPrimitive.AccordionMultipleProps) => (
  <AccordionPrimitive.Root {...props} className={twMerge("w-80 text-bunker-300", props.className)}>
    {children}
  </AccordionPrimitive.Root>
);
