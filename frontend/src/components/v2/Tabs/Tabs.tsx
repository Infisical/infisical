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
    className={twMerge("flex shrink-0 border-b-2 border-mineshaft-800", className)}
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
  ...props
}: TabProps & { variant?: "project" | "namespace" | "org" }) => (
  <TabsPrimitive.Trigger
    className={twMerge(
      "flex h-10 items-center justify-center px-3 text-sm font-medium text-mineshaft-400 transition-all select-none first:rounded-tl-md last:rounded-tr-md hover:text-mineshaft-200 data-[state=active]:border-b data-[state=active]:text-white",
      variant === "project" && "data-[state=active]:border-primary",
      variant === "namespace" && "data-[state=active]:border-namespace-v1",
      variant === "org" && "data-[state=active]:border-org-v1",
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
    className={twMerge("grow rounded-br-md rounded-bl-md py-5 outline-hidden", className)}
    {...props}
  >
    {children}
  </TabsPrimitive.Content>
);
