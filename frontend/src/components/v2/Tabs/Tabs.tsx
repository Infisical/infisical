import * as TabsPrimitive from "@radix-ui/react-tabs";
import { twMerge } from "tailwind-merge";

export type TabsProps = TabsPrimitive.TabsProps;

export const Tabs = ({ className, children, ...props }: TabsProps) => (
  <TabsPrimitive.Root className={twMerge("flex flex-col", className)} {...props}>
    {children}
  </TabsPrimitive.Root>
);

export type TabListProps = TabsPrimitive.TabsListProps;

export const TabList = ({ className, children, ...props }: TabListProps) => (
  <TabsPrimitive.List
    className={twMerge("flex flex-shrink-0 border-b-2 border-mineshaft-800", className)}
    {...props}
  >
    {children}
  </TabsPrimitive.List>
);

export type TabProps = TabsPrimitive.TabsTriggerProps;

export const Tab = ({ className, children, ...props }: TabProps) => (
  <TabsPrimitive.Trigger
    className={twMerge(
      "flex h-10 select-none items-center justify-center px-3 text-sm font-medium text-mineshaft-400 transition-all first:rounded-tl-md last:rounded-tr-md hover:text-mineshaft-200 data-[state=active]:border-b data-[state=active]:border-primary data-[state=active]:text-white",
      className
    )}
    {...props}
  >
    {children}
  </TabsPrimitive.Trigger>
);

export type TabPanelProps = TabsPrimitive.TabsContentProps;

export const TabPanel = ({ className, children, ...props }: TabPanelProps) => (
  <TabsPrimitive.Content
    className={twMerge("flex-grow rounded-bl-md rounded-br-md py-5 outline-none", className)}
    {...props}
  >
    {children}
  </TabsPrimitive.Content>
);
