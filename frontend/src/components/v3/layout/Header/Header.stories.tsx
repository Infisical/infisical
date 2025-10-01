import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChevronsUpDownIcon } from "lucide-react";

import { Badge } from "../../generic/Badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator
} from "../../generic/Breadcrumb";
import { Tabs, TabsList, TabsTrigger } from "../../generic/Tabs";
import { NamespaceIcon, OrgIcon, ProductBadgeProps, ProductIconMap } from "../../platform";
import { Header } from "./Header";

const DemoTabs = [
  "overview",
  "integrations",
  "approvals",
  "app-connections",
  "access-control",
  "audit-logs",
  "settings"
];

const HeaderDemo = ({ variant }: { variant: ProductBadgeProps["variant"] }) => {
  return (
    <Header className="w-full">
      <div className="flex w-full items-center justify-between">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <img
                alt="infisical logo"
                src="/images/logotransparent_trimmed.png"
                className="h-3.5"
              />
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
              <Badge variant={variant}>
                {ProductIconMap[variant]}
                {variant}
                <ChevronsUpDownIcon />
              </Badge>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <Tabs className="mt-auto" defaultValue={DemoTabs[0]} variant={variant}>
        <TabsList>
          {DemoTabs.map((tab) => (
            <TabsTrigger value={tab} className="capitalize">
              {tab.replace("-", " ")}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </Header>
  );
};

const meta = {
  title: "Layout/Header",
  component: HeaderDemo,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["secrets-manager", "secret-scanning", "cert-manager", "ssh", "kms", "pam"]
    }
  },
  args: {}
} satisfies Meta<typeof HeaderDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SecretsManagement: Story = {
  args: {
    variant: "secret-manager"
  }
};

export const SecretScanning: Story = {
  args: {
    variant: "secret-scanning"
  }
};

export const PKI: Story = {
  args: {
    variant: "cert-manager"
  }
};

export const SSH: Story = {
  args: {
    variant: "ssh"
  }
};

export const KMS: Story = {
  args: {
    variant: "kms"
  }
};

export const PAM: Story = {
  args: {
    variant: "pam"
  }
};
