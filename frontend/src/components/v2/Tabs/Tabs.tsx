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
    className={twMerge("flex-shrink-0 flex  border-b-2 border-mineshaft-800", className)}
    {...props}
  >
    {children}
  </TabsPrimitive.List>
);

export type TabProps = TabsPrimitive.TabsTriggerProps;

export const Tab = ({ className, children, ...props }: TabProps) => (
  <TabsPrimitive.Trigger
    className={twMerge(
      "px-3 h-10 font-medium text-sm flex items-center justify-center select-none first:rounded-tl-md last:rounded-tr-md hover:text-mineshaft-200 text-mineshaft-400 transition-all data-[state=active]:text-white data-[state=active]:border-b data-[state=active]:border-primary",
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
    className={twMerge("outline-none flex-grow py-5 rounded-bl-md rounded-br-md", className)}
    {...props}
  >
    {children}
  </TabsPrimitive.Content>
);
