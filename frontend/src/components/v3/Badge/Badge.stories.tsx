import type { Meta, StoryObj } from "@storybook/react-vite";
import { LogInIcon, UserIcon } from "lucide-react";
import { fn } from "storybook/test";

import { Badge } from "./Badge";

const meta = {
  title: "Badge",
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
        "secrets",
        "scanning",
        "pki",
        "ssh",
        "kms",
        "pam",
        "success",
        "info",
        "warning",
        "danger"
      ]
    },
    leftIcon: {
      control: { type: "select" },
      options: ["UserIcon", "None"],
      mapping: {
        UserIcon,
        None: undefined
      }
    },
    rightIcon: {
      control: { type: "select" },
      options: ["LogInIcon", "None"],
      mapping: {
        LogInIcon,
        None: undefined
      }
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

export const Outline: Story = {
  args: {
    variant: "outline"
  }
};

export const SecretsManagement: Story = {
  args: {
    variant: "secrets"
  }
};

export const SecretScanning: Story = {
  args: {
    variant: "scanning"
  }
};

export const PKI: Story = {
  args: {
    variant: "pki"
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
    leftIcon: UserIcon
  }
};

export const RightIcon: Story = {
  args: {
    rightIcon: LogInIcon
  }
};

export const AsLink: Story = {
  args: {
    asChild: true,
    children: <a>Link</a>
  }
};
