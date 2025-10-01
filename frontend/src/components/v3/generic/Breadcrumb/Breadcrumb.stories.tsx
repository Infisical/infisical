import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChevronsUpDownIcon } from "lucide-react";

import { Badge } from "@app/components/v3/generic";
import { NamespaceIcon, OrgIcon, SecretScanningIcon } from "@app/components/v3/platform";

import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbSeparator } from "./Breadcrumb";

function BreadcrumbDemo() {
  return (
    <Breadcrumb>
      <BreadcrumbList>
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
      </BreadcrumbList>
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

export const Demo: Story = {};
