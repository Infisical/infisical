import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  HardDrive,
  HardDriveIcon,
  IdCardLanyardIcon,
  KeySquareIcon,
  UserIcon,
  UsersIcon
} from "lucide-react";

import { Tabs, TabsList, TabsProps, TabsTrigger } from "./Tabs";

const DemoTabs = [
  "overview",
  "integrations",
  "approvals",
  "app-connections",
  "access-control",
  "audit-logs",
  "settings"
];

const TabsDemo = (props: TabsProps) => {
  return (
    <Tabs defaultValue={DemoTabs[0]} {...props}>
      <TabsList>
        {DemoTabs.map((tab) => (
          <TabsTrigger value={tab} className="capitalize">
            {tab.replace("-", " ")}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
};

const meta = {
  title: "Generic/Tabs",
  component: TabsDemo,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: [
        "org",
        "namespace",
        "secrets-manager",
        "secret-scanning",
        "cert-manager",
        "ssh",
        "kms",
        "pam",
        "ghost"
      ]
    },
    orientation: { control: "inline-radio", options: ["horizontal", "vertical"] }
  }
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Organization: Story = {
  name: "Variant: Organization",
  args: {
    variant: "org"
  }
};

export const Namespace: Story = {
  name: "Variant: Namespace",
  args: {
    variant: "namespace"
  }
};

export const SecretsManagement: Story = {
  name: "Variant: Secrets Management",
  args: {
    variant: "secret-manager"
  }
};

export const SecretScanning: Story = {
  name: "Variant: Secret Scanning",
  args: {
    variant: "secret-scanning"
  }
};

export const PKI: Story = {
  name: "Variant: PKI",
  args: {
    variant: "cert-manager"
  }
};

export const SSH: Story = {
  name: "Variant: SSH",
  args: {
    variant: "ssh"
  }
};

export const KMS: Story = {
  name: "Variant: KMS",
  args: {
    variant: "kms"
  }
};

export const PAM: Story = {
  name: "Variant: PAM",
  args: {
    variant: "pam"
  }
};

// TODO: create aliases for resources

export const Ghost = (props: TabsProps) => {
  return (
    <Tabs defaultValue="users" {...props}>
      <TabsList>
        <TabsTrigger value="users">
          <UserIcon />
          Users
        </TabsTrigger>
        <TabsTrigger value="identities">
          <HardDriveIcon />
          Identities
        </TabsTrigger>
        <TabsTrigger value="groups">
          <UsersIcon />
          Group
        </TabsTrigger>
        <TabsTrigger value="service-tokens">
          <KeySquareIcon />
          Service Tokens
        </TabsTrigger>
        <TabsTrigger value="Roles">
          <IdCardLanyardIcon />
          Roles
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
};

Ghost.storyName = "Variant: Ghost";
Ghost.args = {
  variant: "ghost",
  orientation: "vertical"
};
