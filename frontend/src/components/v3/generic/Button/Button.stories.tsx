import type { Meta, StoryObj } from "@storybook/react-vite";
import { LogInIcon } from "lucide-react";
import { fn } from "storybook/test";

import { NamespaceIcon } from "@app/components/v3/platform";

import { Button } from "./Button";

const meta = {
  title: "Generic/Button",
  component: Button,
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
    size: { control: "inline-radio", options: ["sm", "md", "lg"] },
    isFullWidth: { control: "boolean" },
    isPending: { control: "boolean" },
    isDisabled: { control: "boolean" }
  },
  args: {
    onClick: fn(),
    children: "Button",
    size: "md",
    isFullWidth: false,
    isPending: false,
    isDisabled: false
  },
  decorators: (Story) => {
    return (
      <div className="flex w-[240px] justify-center">
        <Story />
      </div>
    );
  }
} satisfies Meta<typeof Button>;

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

export const Ghost: Story = {
  args: {
    variant: "ghost"
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

export const IsFullWidth: Story = {
  args: {
    isFullWidth: true
  }
};

export const IsDisabled: Story = {
  args: {
    isDisabled: true
  }
};

export const IsPending: Story = {
  args: {
    isPending: true
  }
};

export const LeftIcon: Story = {
  args: {
    variant: "namespace",
    children: (
      <>
        <NamespaceIcon />
        Namespace
      </>
    )
  }
};

export const RightIcon: Story = {
  args: {
    children: (
      <>
        Button <LogInIcon />
      </>
    )
  }
};
