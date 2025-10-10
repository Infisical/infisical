import type { Meta, StoryObj } from "@storybook/react-vite";
import { CheckCircleIcon, InfoIcon, TriangleAlertIcon, XCircleIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "./Alert";

const meta = {
  title: "Generic/Alert",
  component: Alert,
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
        "secret-manager",
        "secret-scanning",
        "cert-manager",
        "ssh",
        "pam",
        "kms",
        "org",
        "namespace",
        "success",
        "info",
        "warning",
        "danger"
      ]
    }
  },
  args: {
    children: (
      <>
        <AlertTitle>Alert Title</AlertTitle>
        <AlertDescription>This is an alert description.</AlertDescription>
      </>
    )
  }
} satisfies Meta<typeof Alert>;

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

export const SecretManager: Story = {
  name: "Variant: Secret Manager",
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

export const CertManager: Story = {
  name: "Variant: Cert Manager",
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

export const PAM: Story = {
  name: "Variant: PAM",
  args: {
    variant: "pam"
  }
};

export const KMS: Story = {
  name: "Variant: KMS",
  args: {
    variant: "kms"
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

export const Success: Story = {
  name: "Variant: Success",
  args: {
    variant: "success",
    children: (
      <>
        <CheckCircleIcon />
        <AlertTitle>Success</AlertTitle>
        <AlertDescription>Your changes have been saved successfully.</AlertDescription>
      </>
    )
  }
};

export const Info: Story = {
  name: "Variant: Info",
  args: {
    variant: "info",
    children: (
      <>
        <InfoIcon />
        <AlertTitle>Info</AlertTitle>
        <AlertDescription>This is some important information you should know.</AlertDescription>
      </>
    )
  }
};

export const Warning: Story = {
  name: "Variant: Warning",
  args: {
    variant: "warning",
    children: (
      <>
        <TriangleAlertIcon />
        <AlertTitle>Warning</AlertTitle>
        <AlertDescription>Please review this warning before proceeding.</AlertDescription>
      </>
    )
  }
};

export const Danger: Story = {
  name: "Variant: Danger",
  args: {
    variant: "danger",
    children: (
      <>
        <XCircleIcon />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>An error occurred while processing your request.</AlertDescription>
      </>
    )
  }
};

export const WithIcon: Story = {
  name: "Example: With Icon",
  args: {
    variant: "info",
    children: (
      <>
        <InfoIcon />
        <AlertTitle>Heads up!</AlertTitle>
        <AlertDescription>You can add components to your app using the cli.</AlertDescription>
      </>
    )
  }
};

export const WithoutIcon: Story = {
  name: "Example: Without Icon",
  args: {
    variant: "warning",
    children: (
      <>
        <AlertTitle>Important Notice</AlertTitle>
        <AlertDescription>
          This alert doesn&apos;t have an icon, but still conveys important information.
        </AlertDescription>
      </>
    )
  }
};

export const TitleOnly: Story = {
  name: "Example: Title Only",
  args: {
    variant: "success",
    children: (
      <>
        <CheckCircleIcon />
        <AlertTitle>Operation completed successfully</AlertTitle>
      </>
    )
  }
};

export const DescriptionOnly: Story = {
  name: "Example: Description Only",
  args: {
    variant: "default",
    children: (
      <AlertDescription>This is an alert with only a description, no title.</AlertDescription>
    )
  }
};
