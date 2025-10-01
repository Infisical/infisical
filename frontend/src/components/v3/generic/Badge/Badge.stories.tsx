import type { Meta, StoryObj } from "@storybook/react-vite";
import { LogInIcon, UserIcon } from "lucide-react";
import { fn } from "storybook/test";

import { Badge } from "./Badge";

const meta = {
  title: "Generic/Badge",
  component: Badge,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: [
        "default",
        "outline",
        "org",
        "namespace",
        "secrets-manager",
        "secret-scanning",
        "cert-manager",
        "ssh",
        "kms",
        "pam",
        "success",
        "info",
        "warning",
        "danger"
      ]
    }
  },
  args: { onClick: fn(), children: "Badge" }
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    variant: "default"
  }
};

export const Accent: Story = {
  args: {
    variant: "accent"
  }
};

export const Outline: Story = {
  args: {
    variant: "outline"
  }
};

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

export const Success: Story = {
  args: {
    variant: "success"
  }
};

export const Info: Story = {
  args: {
    variant: "info"
  }
};

export const Warning: Story = {
  args: {
    variant: "warning"
  }
};

export const Danger: Story = {
  args: {
    variant: "danger"
  }
};

export const LeftIcon: Story = {
  args: {
    children: (
      <>
        <UserIcon />
        Badge
      </>
    )
  }
};

export const RightIcon: Story = {
  args: {
    children: (
      <>
        Badge <LogInIcon />
      </>
    )
  }
};

export const AsLink: Story = {
  args: {
    asChild: true,
    children: <a>Link</a>
  }
};
