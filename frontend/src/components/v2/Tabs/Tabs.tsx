import { IconDefinition } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { twMerge } from "tailwind-merge";

export type TabsProps = TabsPrimitive.TabsProps;

export const Tabs = ({ className, children, ...props }: TabsProps) => (
  <TabsPrimitive.Root
    className={twMerge(
      "flex",
      className,
      props.orientation === "vertical" ? "flex-col xl:flex-row xl:gap-x-12" : "flex-col"
    )}
    {...props}
  >
    {children}
  </TabsPrimitive.Root>
);

export type TabListProps = TabsPrimitive.TabsListProps;

export const TabList = ({ className, children, ...props }: TabListProps) => (
  <TabsPrimitive.List
    className={twMerge(
      "no-scrollbar flex shrink-0 overflow-auto border-b-2 border-mineshaft-800",
      "data-[orientation=vertical]:xl:flex-col data-[orientation=vertical]:xl:items-start data-[orientation=vertical]:xl:gap-y-6 data-[orientation=vertical]:xl:border-b-0",
      className
    )}
    {...props}
  >
    {children}
  </TabsPrimitive.List>
);

export type TabProps = TabsPrimitive.TabsTriggerProps;

export const Tab = ({
  className,
  children,
  variant = "project",
  icon,
  ...props
}: TabProps & {
  icon?: IconDefinition;
  variant?: "project" | "namespace" | "org" | "instance";
}) => (
  <TabsPrimitive.Trigger
    className={twMerge(
      "flex h-11 cursor-pointer items-center justify-center border-transparent",
      "px-3 text-sm font-medium whitespace-nowrap text-mineshaft-300/75 transition-all select-none",
      "data-[orientation=vertical]:xl:h-5 data-[orientation=vertical]:xl:border-b-0 data-[orientation=vertical]:xl:border-l",
      "border-b hover:text-mineshaft-200",
      "data-[state=active]:border-mineshaft-400 data-[state=active]:text-white",
      "hover:border-mineshaft-400",
      variant === "project" && "data-[state=active]:border-primary",
      variant === "namespace" && "data-[state=active]:border-namespace-v1",
      variant === "org" && "data-[state=active]:border-org-v1",
      variant === "instance" && "data-[state=active]:border-mineshaft-300",
      className
    )}
    {...props}
  >
    {icon && <FontAwesomeIcon icon={icon} className="mr-2" size="xs" />}
    {children}
  </TabsPrimitive.Trigger>
);

export type TabPanelProps = TabsPrimitive.TabsContentProps;

export const TabPanel = ({ className, children, ...props }: TabPanelProps) => (
  <TabsPrimitive.Content
    className={twMerge(
      "grow rounded-br-md rounded-bl-md py-5 outline-hidden data-[orientation=vertical]:xl:overflow-x-hidden data-[orientation=vertical]:xl:py-0",
      className
    )}
    {...props}
  >
    {children}
  </TabsPrimitive.Content>
);
