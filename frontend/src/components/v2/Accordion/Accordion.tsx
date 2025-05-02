import { forwardRef } from "react";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as AccordionPrimitive from "@radix-ui/react-accordion";
import { twMerge } from "tailwind-merge";

export const AccordionItem = forwardRef<HTMLDivElement, AccordionPrimitive.AccordionItemProps>(
  ({ children, className, ...props }, forwardedRef) => (
    <AccordionPrimitive.Item
      className={twMerge(
        "mt-px overflow-hidden border-transparent transition-all first:mt-0 data-[state=open]:border-l data-[state=open]:border-primary",
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
        "group flex h-11 flex-1 items-center justify-between px-4 py-2 outline-none hover:text-primary data-[state=open]:text-primary",
        className
      )}
      {...props}
      ref={forwardedRef}
    >
      {children}
      <FontAwesomeIcon
        icon={faChevronDown}
        className="text-sm transition-transform duration-300 ease-[cubic-bezier(0.87,_0,_0.13,_1)] group-data-[state=open]:rotate-180"
        aria-hidden
      />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));

AccordionTrigger.displayName = "AccordionTrigger";

export const AccordionContent = forwardRef<
  HTMLDivElement,
  AccordionPrimitive.AccordionContentProps & {
    childrenClassName?: string;
  }
>(({ children, className, childrenClassName, ...props }, forwardedRef) => (
  <AccordionPrimitive.Content
    className={twMerge(
      "overflow-hidden data-[state=closed]:animate-slideUp data-[state=open]:animate-slideDown",
      className
    )}
    {...props}
    ref={forwardedRef}
  >
    <div className={twMerge("px-4 py-2 text-sm", childrenClassName)}>{children}</div>
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
