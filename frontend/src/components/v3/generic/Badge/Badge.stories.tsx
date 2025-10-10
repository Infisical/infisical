import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChevronsUpDownIcon, ExternalLinkIcon, LogInIcon } from "lucide-react";
import { fn } from "storybook/test";

import { NamespaceIcon, OrgIcon } from "@app/components/v3/platform";

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
        "accent",
        "outline",
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
    }
  },
  args: { onClick: fn(), children: "Badge" }
} satisfies Meta<typeof Badge>;

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

export const LeftIcon: Story = {
  name: "Example: Left Icon",
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
  name: "Example: Right Icon",
  args: {
    children: (
      <>
        Badge <LogInIcon />
      </>
    )
  }
};

export const BothIcons: Story = {
  name: "Example: Both Icons",
  args: {
    variant: "org",
    children: (
      <>
        <OrgIcon />
        Organization
        <ChevronsUpDownIcon />
      </>
    )
  }
};

export const AsExternalLink: Story = {
  name: "Example: As External Link",
  args: {
    variant: "info",
    as: "a",
    href: "https://infisical.com/",
    children: (
      <>
        Link <ExternalLinkIcon />
      </>
    )
  }
};

export const AsRouterLink: Story = {
  name: "Example: As Router Link",
  args: {
    as: "link",
    to: ".",
    children: "Router Link"
  }
};

export const AsButton: Story = {
  name: "Example: As Button",
  args: {
    variant: "org",
    as: "button",
    onClick: fn(() => console.log("Congrats")),
    children: (
      <>
        <OrgIcon />
        Organization
        <ChevronsUpDownIcon />
      </>
    )
  }
};
