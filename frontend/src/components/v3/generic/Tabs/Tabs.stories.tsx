import type { Meta, StoryObj } from "@storybook/react-vite";

import { Tabs, TabsList, TabsTrigger } from "./Tabs";

const DemoTabs = [
  "overview",
  "integrations",
  "approvals",
  "app-connections",
  "access-control",
  "audit-logs",
  "settings"
];

const TabsDemo = () => {
  return (
    <Tabs defaultValue={DemoTabs[0]}>
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
        "pam"
      ]
    }
  },
  args: {}
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Organization: Story = {
  args: {
    variant: "org"
  }
};

export const Namespace: Story = {
  args: {
    variant: "namespace"
  }
};

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
