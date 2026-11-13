import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CircleAlert, Server, Shield } from "lucide-react";

import { UpgradeDialogLayout } from "@app/components/license/UpgradeGate/UpgradeDialogLayout";
import { Alert, AlertDescription, Button } from "@app/components/v3";

const meta = {
  title: "License/Capability Upgrade Dialog",
  component: UpgradeDialogLayout,
  args: {
    scopeName: "Infisical Platform",
    icon: <Shield className="size-10 text-muted" />,
    title: "Unlock Groups",
    description: "Review your organization's subscription options.",
    onOpenChange: () => undefined,
    children: (
      <>
        <p className="text-sm text-foreground">
          Manage access for teams by organizing members into groups.
        </p>
        <Alert variant="info">
          <CircleAlert />
          <AlertDescription>
            This capability is shared across products. Review your billing options to find a
            subscription that includes it.
          </AlertDescription>
        </Alert>
      </>
    ),
    footer: (
      <Button data-upgrade-cta variant="org" className="w-full">
        View Plans
      </Button>
    )
  },
  render: function Render(args) {
    const [isOpen, setIsOpen] = useState(true);
    return isOpen ? (
      <UpgradeDialogLayout {...args} onOpenChange={setIsOpen} />
    ) : (
      <Button onClick={() => setIsOpen(true)}>Open Upgrade Dialog</Button>
    );
  }
} satisfies Meta<typeof UpgradeDialogLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Platform: Story = {};

export const SubOrganization: Story = {
  args: {
    children: (
      <>
        <p className="text-sm text-foreground">
          Manage access for teams by organizing members into groups.
        </p>
        <Alert variant="info">
          <CircleAlert />
          <AlertDescription>
            Sub-organizations share the root organization&apos;s subscription. Review available
            options in root billing.
          </AlertDescription>
        </Alert>
      </>
    ),
    footer: (
      <Button data-upgrade-cta variant="org" className="w-full">
        Continue to Root Billing
      </Button>
    )
  }
};

export const Instance: Story = {
  args: {
    scopeName: "Infisical Instance",
    icon: <Server className="size-10 text-muted" />,
    title: "Unlock Instance User Management",
    description: "Review licensing for your self-hosted instance.",
    children: (
      <>
        <p className="text-sm text-foreground">Manage users across your self-hosted instance.</p>
        <Alert variant="info">
          <CircleAlert />
          <AlertDescription>
            This capability is licensed for the entire instance, not an individual product. Contact
            our team to discuss your deployment.
          </AlertDescription>
        </Alert>
      </>
    ),
    footer: (
      <Button data-upgrade-cta variant="org" className="w-full">
        Contact Sales
      </Button>
    )
  }
};
