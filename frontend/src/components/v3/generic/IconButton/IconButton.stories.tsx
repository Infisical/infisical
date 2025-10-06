import type { Meta, StoryObj } from "@storybook/react-vite";
import { EditIcon } from "lucide-react";
import { fn } from "storybook/test";

import { IconButton } from "./IconButton";

const meta = {
  title: "Generic/IconButton",
  component: IconButton,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: [
        "default",
        "accent",
        "outline",
        "ghost",
        "org",
        "namespace",
        "secret-manager",
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
    },
    size: { control: "inline-radio", options: ["xs", "sm", "md", "lg"] },
    isPending: { control: "boolean" },
    isDisabled: { control: "boolean" },
    children: {
      table: {
        disable: true
      }
    }
  },
  args: {
    onClick: fn(),
    size: "md",
    isPending: false,
    isDisabled: false,
    children: <EditIcon />
  }
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Variant: Default",
  args: {
    variant: "default"
  }
};

export const Accent: Story = {
  name: "Variant: Accent",
  args: {
    variant: "accent"
  }
};

export const Outline: Story = {
  name: "Variant: Outline",
  args: {
    variant: "outline"
  }
};

export const Ghost: Story = {
  name: "Variant: Ghost",
  args: {
    variant: "ghost"
  }
};

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

export const Success: Story = {
  name: "Variant: Success",
  args: {
    variant: "success"
  }
};

export const Info: Story = {
  name: "Variant: Info",
  args: {
    variant: "info"
  }
};

export const Warning: Story = {
  name: "Variant: Warning",
  args: {
    variant: "warning"
  }
};

export const Danger: Story = {
  name: "Variant: Danger",
  args: {
    variant: "danger"
  }
};

export const IsFullWidth: Story = {
  name: "State: isFullWidth",
  args: {
    isFullWidth: true
  }
};

export const IsDisabled: Story = {
  name: "State: isDisabled",
  args: {
    isDisabled: true
  }
};

export const IsPending: Story = {
  name: "State: isPending",
  args: {
    isPending: true
  }
};

export const ExtraSmall: Story = {
  name: "Size: Extra Small",
  args: {
    size: "xs"
  }
};

export const Medium: Story = {
  name: "Size: Medium",
  args: {
    size: "md"
  }
};

export const Small: Story = {
  name: "Size: Small",
  args: {
    size: "sm"
  }
};

export const Large: Story = {
  name: "Size: Large",
  args: {
    size: "lg"
  }
};
