import type { Meta, StoryObj } from "@storybook/react-vite";

import { ProductBadge } from "./ProductBadge";

const meta = {
  title: "Platform/ProductBadge",
  component: ProductBadge,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["secret-manager", "secret-scanning", "cert-manager", "ssh", "kms", "pam"]
    },
    size: {
      control: "inline-radio",
      options: ["sm", "md", "lg"]
    }
  },
  args: {
    size: "md"
  }
} satisfies Meta<typeof ProductBadge>;

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
