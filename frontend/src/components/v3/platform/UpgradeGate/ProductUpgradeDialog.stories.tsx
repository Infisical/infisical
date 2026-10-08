import { CSSProperties, useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CircleAlert } from "lucide-react";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { ProductUpgradeDialog } from "@app/components/license/UpgradeGate/ProductUpgradeDialog";
import { ProductUpgradeSuccessDialog } from "@app/components/license/UpgradeGate/ProductUpgradeSuccessDialog";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Checkbox,
  Label,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { BillingV2CatalogProduct, BillingV2Plan } from "@app/hooks/api";
import { fmtMoney } from "@app/pages/organization/BillingV2Page/billing-v2-format";

const freePlan: BillingV2Plan = {
  tier: "free",
  name: "Free",
  selfServe: false,
  salesLed: false,
  trialable: false,
  upgradeable: false,
  trialDays: 0,
  dims: []
};

const proPlan: BillingV2Plan = {
  ...freePlan,
  tier: "pro",
  name: "Pro",
  selfServe: true,
  trialable: true,
  upgradeable: true,
  trialDays: 14,
  dims: [
    {
      key: "pam_identities",
      label: "PAM identities",
      noun: "PAM identity",
      monthly: 20,
      annual: 208,
      included: 5,
      meteredMonthly: true,
      meteredAnnual: false
    }
  ]
};

const enterprisePlan: BillingV2Plan = {
  ...freePlan,
  tier: "enterprise",
  name: "Enterprise",
  salesLed: true
};

const product: BillingV2CatalogProduct = {
  id: "pam",
  name: "Privileged Access Management",
  icon: "users",
  color: "var(--color-product-pam)",
  baselinePlan: freePlan,
  plans: [proPlan, enterprisePlan],
  compare: [
    { label: "Privileged accounts", cells: { free: 5, pro: "Up to 50", enterprise: "Unlimited" } },
    { label: "Approval workflows", cells: { free: false, pro: true, enterprise: true } },
    { label: "Access requests", cells: { free: false, pro: true, enterprise: true } },
    { label: "CLI-based resource access", cells: { free: false, pro: true, enterprise: true } },
    {
      label: "SSH certificate authentication",
      cells: { free: false, pro: true, enterprise: true }
    },
    {
      label: "Privileged credential rotation",
      cells: { free: false, pro: true, enterprise: true }
    },
    { label: "Command blocking", cells: { free: false, pro: true, enterprise: true } },
    {
      label: "Session recording retention",
      cells: { free: false, pro: "30 days", enterprise: "Custom" }
    },
    { label: "SCIM", cells: { free: false, pro: false, enterprise: true } }
  ]
};

const descriptions: Record<string, string> = {
  "Privileged accounts": "Manage privileged accounts and their credentials centrally.",
  "Approval workflows": "Require approval before privileged access is granted.",
  "Access requests": "Request access to privileged accounts before starting a session.",
  "CLI-based resource access": "Connect to privileged resources from the Infisical CLI.",
  "SSH certificate authentication": "Authenticate SSH sessions with short-lived certificates.",
  "Privileged credential rotation":
    "Rotate privileged credentials without distributing them to users.",
  "Command blocking": "Block restricted commands during privileged sessions.",
  "Session recording retention": "Keep session recordings available for review.",
  SCIM: "Provision and deprovision users from your identity provider."
};

const meta = {
  title: "License/Product Upgrade Dialog",
  component: ProductUpgradeDialog,
  parameters: {
    layout: "centered",
    docs: {
      description: {
        component:
          "Minimal presentation states for the shared upgrade modal, using one illustrative catalog rather than separate examples per product. Trial pricing is monthly-only; paid pricing can switch cadence. The examples never perform billing mutations or reproduce backend eligibility checks. The enabled CTA receives initial focus, dismissal is interactive, and only the right-side body scrolls."
      }
    }
  },
  args: {
    product,
    plans: [freePlan, proPlan, enterprisePlan],
    upgradeLabel: undefined,
    requiredPlanName: "Pro",
    selectedTier: "pro",
    currentPlanTier: "free",
    features: [],
    footer: null,
    onTierChange: () => undefined,
    onOpenChange: () => undefined
  },
  render: function Render(args) {
    const [isOpen, setIsOpen] = useState(true);
    const [tier, setTier] = useState(args.selectedTier);
    const [annual, setAnnual] = useState(true);
    const plan = args.plans.find((candidate) => candidate.tier === tier) ?? args.plans[0];
    const requiredIndex = args.plans.findIndex(
      (candidate) => candidate.name === args.requiredPlanName
    );
    const meetsRequirement = args.plans.indexOf(plan) >= requiredIndex;
    const features = (args.product.compare ?? []).flatMap((row) => {
      const value = row.cells[plan.tier];
      return value === false || value === undefined || value === 0
        ? []
        : [
            {
              label: row.label,
              value: value === true ? undefined : String(value),
              description: descriptions[row.label]
            }
          ];
    });
    const trialAvailable = meetsRequirement && plan.trialable && !plan.salesLed;
    const contactSales = plan.salesLed || (!plan.selfServe && plan.tier !== "free");
    const monthlyRate = plan.base?.monthly || plan.dims[0]?.monthly || 0;
    const annualRate = plan.base?.annual || plan.dims[0]?.annual || 0;
    const hasPeriodOption = !trialAvailable && monthlyRate > 0 && annualRate > 0;
    const useAnnual = !trialAvailable && annual && annualRate > 0;
    const meteredAnnual = !plan.base?.annual && plan.dims[0]?.meteredAnnual;
    let price = monthlyRate;
    if (useAnnual) price = meteredAnnual ? annualRate : annualRate / 12;
    const noun = plan.dims[0]?.noun;
    const unit = plan.base ? "/mo" : `/${noun}/${useAnnual && meteredAnnual ? "yr" : "mo"}`;
    const priceLabel = price > 0 ? `${fmtMoney(price, 6)}${unit}` : "Usage-based";
    const savingsPercent =
      monthlyRate > 0 && annualRate > 0 && !meteredAnnual
        ? Math.max(Math.round((1 - annualRate / 12 / monthlyRate) * 100), 0)
        : 0;
    const trialDuration = plan.trialDays === 14 ? "2-Week" : `${plan.trialDays}-Day`;
    const trialPriceLabel =
      plan.trialDays === 14 ? "FREE for 2 Weeks" : `FREE for ${plan.trialDays} Days`;
    let action = "View Billing Options";
    if (!meetsRequirement) action = `Select ${args.requiredPlanName} or higher`;
    else if (contactSales) action = "Contact Sales";
    else if (trialAvailable) action = `Start Free ${plan.name} Trial`;

    if (!isOpen) {
      return <Button onClick={() => setIsOpen(true)}>Open Upgrade Dialog</Button>;
    }

    return (
      <ProductUpgradeDialog
        {...args}
        upgradeLabel={args.upgradeLabel ?? `Unlock ${args.product.name}`}
        selectedTier={tier}
        onTierChange={setTier}
        onOpenChange={setIsOpen}
        features={features}
        notice={meetsRequirement && !trialAvailable && !plan.salesLed ? args.notice : undefined}
        footer={
          <>
            {plan.tier === "free" && (
              <div className="flex items-center justify-center gap-3 px-1 text-sm">
                <span className="text-muted">Current plan</span>
                <span className="font-medium text-foreground">FREE</span>
              </div>
            )}
            {!plan.salesLed &&
              plan.tier !== "free" &&
              (trialAvailable ? (
                <Tooltip key={plan.tier}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-baseline justify-between gap-3 rounded-sm px-1 text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="text-muted line-through">{priceLabel}</span>
                      <span className="font-medium text-foreground">{trialPriceLabel}*</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="w-96 max-w-(--radix-tooltip-content-available-width) leading-relaxed"
                  >
                    Your {trialDuration.toLowerCase()} trial is free. A payment method is required.
                    If you do not have one on file, secure card setup must finish before the trial
                    starts. After the trial, billing continues monthly based on usage unless you
                    cancel.
                  </TooltipContent>
                </Tooltip>
              ) : (
                <div
                  className={`flex flex-wrap items-center gap-3 px-1 ${hasPeriodOption ? "justify-between" : "justify-center"}`}
                >
                  {hasPeriodOption && (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="story-annual-billing"
                        variant="org"
                        isChecked={annual}
                        onCheckedChange={(checked) => setAnnual(checked === true)}
                      />
                      <Label htmlFor="story-annual-billing">Annual Billing</Label>
                      {annual && savingsPercent > 0 && (
                        <Badge variant="success" className="min-h-4 px-1 py-0 text-[10px]">
                          -{savingsPercent}%
                        </Badge>
                      )}
                    </div>
                  )}
                  <div
                    className={`flex items-baseline gap-2 text-sm tabular-nums ${hasPeriodOption ? "ml-auto" : ""}`}
                  >
                    <span className="font-medium text-foreground">{priceLabel}</span>
                  </div>
                </div>
              ))}
            <Button
              data-upgrade-cta
              variant="product"
              className="w-full justify-center"
              style={{ "--product-color": args.product.color } as CSSProperties}
              isDisabled={!meetsRequirement}
            >
              {action}
            </Button>
          </>
        }
      />
    );
  }
} satisfies Meta<typeof ProductUpgradeDialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Trial: Story = {
  args: { upgradeLabel: "Unlock Approval Workflows" },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const getAction = () => body.getByRole("button", { name: "Start Free Pro Trial" });

    await waitFor(() => expect(getAction()).toHaveFocus());
    await userEvent.click(body.getByRole("tab", { name: "Enterprise" }));
    await expect(body.getByRole("tab", { name: "Enterprise" })).toHaveFocus();
    await userEvent.click(body.getByRole("tab", { name: "Pro" }));
    await expect(body.getByRole("tab", { name: "Pro" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(await body.findByRole("button", { name: "Open Upgrade Dialog" }));
    await waitFor(() => expect(getAction()).toHaveFocus());
  }
};

export const Paid: Story = {
  args: {
    plans: [freePlan, { ...proPlan, trialable: false }, enterprisePlan],
    notice: (
      <Alert variant="info" appearance="borderless">
        <CircleAlert />
        <AlertDescription>
          Free trial for Privileged Access Management has already been used.
        </AlertDescription>
      </Alert>
    )
  }
};

export const SalesLed: Story = {
  args: { selectedTier: "enterprise" },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(body.getByRole("button", { name: "Contact Sales" })).toHaveFocus());
  }
};

export const BelowRequiredTier: Story = {
  args: { selectedTier: "free" },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await waitFor(() => expect(body.getByRole("tab", { name: "Free · Current" })).toHaveFocus());
    await expect(body.getByRole("button", { name: "Select Pro or higher" })).not.toHaveFocus();
  }
};

export const TrialSuccess: Story = {
  render: function Render(args) {
    const [isOpen, setIsOpen] = useState(true);
    return isOpen ? (
      <ProductUpgradeSuccessDialog
        product={args.product}
        plan={proPlan}
        isTrialing
        trialEndsAt="Oct 15, 2026"
        onOpenChange={setIsOpen}
      />
    ) : (
      <Button onClick={() => setIsOpen(true)}>Open Success Dialog</Button>
    );
  }
};

export const PlanActivated: Story = {
  render: function Render(args) {
    const [isOpen, setIsOpen] = useState(true);
    return isOpen ? (
      <ProductUpgradeSuccessDialog
        product={args.product}
        plan={proPlan}
        isTrialing={false}
        onOpenChange={setIsOpen}
      />
    ) : (
      <Button onClick={() => setIsOpen(true)}>Open Success Dialog</Button>
    );
  }
};
