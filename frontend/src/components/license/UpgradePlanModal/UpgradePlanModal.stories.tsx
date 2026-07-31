import type { Meta, StoryObj } from "@storybook/react-vite";

import { Dialog } from "@app/components/v3";

import { UpgradePlanModalContent } from "./UpgradePlanModal";

const meta = {
  title: "Platform/Upgrade Plan Modal",
  component: UpgradePlanModalContent,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <Dialog open>
        <Story />
      </Dialog>
    )
  ],
  args: {
    description: "Issue, manage, and automate certificates from one place.",
    featureName: "Certificate Manager",
    onClose: () => undefined,
    orgId: "org-example",
    scopeVariant: "org"
  }
} satisfies Meta<typeof UpgradePlanModalContent>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TrialAvailable: Story = {
  args: {
    offer: {
      kind: "start-trial",
      primaryLabel: "Start a Free 2-week trial",
      productId: "certificate_management"
    }
  }
};

export const TrialAvailableWithBenefits: Story = {
  args: {
    benefits: [
      "Automate certificate issuance and renewal",
      "Centralize certificate inventory and lifecycle management",
      "Enforce certificate policies across teams and environments"
    ],
    offer: {
      kind: "start-trial",
      primaryLabel: "Start a Free 2-week trial",
      productId: "certificate_management"
    }
  }
};

export const TrialAlreadyUsed: Story = {
  args: {
    offer: {
      kind: "view-plans",
      primaryLabel: "View plans",
      productId: "certificate_management",
      reason: "trial-used"
    }
  }
};

export const BillingAccessRequired: Story = {
  args: {
    offer: {
      kind: "ask-admin"
    }
  }
};

export const ManagedBilling: Story = {
  args: {
    offer: {
      kind: "contact-sales",
      primaryLabel: "Contact sales"
    }
  }
};

export const Loading: Story = {
  args: {
    offer: {
      kind: "loading"
    }
  }
};

export const CheckoutUnavailable: Story = {
  args: {
    offer: {
      kind: "temporarily-unavailable"
    }
  }
};
