import { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { MoreHorizontal } from "lucide-react";

import {
  BreadcrumbLink,
  BreadcrumbPage,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableIconButton
} from "@app/components/v3/generic";

import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbSeparator } from "./Breadcrumb";

function BreadcrumbDemo({ children }: { children: ReactNode }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>{children}</BreadcrumbList>
    </Breadcrumb>
  );
}

const meta = {
  title: "Generic/Breadcrumb",
  component: BreadcrumbDemo,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"]
} satisfies Meta<typeof BreadcrumbDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SecretsManagement: Story = {
  name: "Example: Secrets Management",
  args: {
    children: (
      <>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <a href="/">root</a>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <a href="/">api</a>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <UnstableDropdownMenu>
            <UnstableDropdownMenuTrigger asChild>
              <UnstableIconButton size="xs" variant="ghost">
                <MoreHorizontal />
              </UnstableIconButton>
            </UnstableDropdownMenuTrigger>
            <UnstableDropdownMenuContent align="start">
              <UnstableDropdownMenuItem>/logging</UnstableDropdownMenuItem>
              <UnstableDropdownMenuItem>/data-dog</UnstableDropdownMenuItem>
            </UnstableDropdownMenuContent>
          </UnstableDropdownMenu>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <a href="/docs/components">config</a>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage>vars</BreadcrumbPage>
        </BreadcrumbItem>
      </>
    )
  }
};
