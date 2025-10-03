import { ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChevronsUpDownIcon, MoreHorizontal } from "lucide-react";

import {
  Badge,
  BreadcrumbLink,
  BreadcrumbPage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v3/generic";
import { NamespaceIcon, OrgIcon, SecretScanningIcon } from "@app/components/v3/platform";

import { IconButton } from "../IconButton";
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

export const Header: Story = {
  name: "Example: Header",
  args: {
    children: (
      <>
        <BreadcrumbItem>
          <img alt="infisical logo" src="/images/logotransparent_trimmed.png" className="h-3.5" />
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <Badge variant="org">
            <OrgIcon />
            infisical
            <ChevronsUpDownIcon />
          </Badge>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <Badge variant="namespace">
            <NamespaceIcon />
            engineering
            <ChevronsUpDownIcon />
          </Badge>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <Badge variant="secret-scanning">
            <SecretScanningIcon />
            secret-scanning
            <ChevronsUpDownIcon />
          </Badge>
        </BreadcrumbItem>
      </>
    )
  }
};

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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton size="xs" variant="ghost">
                <MoreHorizontal />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem>/logging</DropdownMenuItem>
              <DropdownMenuItem>/data-dog</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
