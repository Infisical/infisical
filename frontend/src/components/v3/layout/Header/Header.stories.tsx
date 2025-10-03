import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  BellIcon,
  ChevronsUpDownIcon,
  CircleQuestionMarkIcon,
  CircleUserIcon,
  LogOutIcon
} from "lucide-react";

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input
} from "@app/components/v3/generic";
import { IconButton } from "@app/components/v3/generic/IconButton";

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
    <Header className="w-[95vw]">
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
        <div className="flex items-center gap-2 whitespace-nowrap">
          <Input
            size="sm"
            placeholder="Find..."
            endAdornment={<Button variant="outline">F</Button>}
          />
          <div className="[&>*:first-child]:rounded-r-none [&>*:last-child]:rounded-l-none [&>*:not(:first-child):not(:last-child)]:rounded-none [&>*:not(:first-child):not(:last-child)]:border-x-0">
            <IconButton size="sm" variant="outline">
              <CircleQuestionMarkIcon />
            </IconButton>
            <IconButton size="sm" variant="outline">
              <BellIcon />
            </IconButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton size="sm" variant="outline">
                  <CircleUserIcon />
                </IconButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Personal Settings</DropdownMenuItem>
                <DropdownMenuItem>Documentation</DropdownMenuItem>
                <DropdownMenuItem>Join Slack Community</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>Copy Token</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <LogOutIcon />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
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
