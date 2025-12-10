import { faCircleCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Button } from "@app/components/v2";
import { useOrganization, useSubscription } from "@app/context";
import { useUpgradeProductToPro } from "@app/hooks/api";
import { SubscriptionProducts } from "@app/hooks/api/types";

const plans = {
  [SubscriptionProducts.Platform]: [
    {
      label: "Free",
      pricing: ["$0 / month"],
      features: ["Google/GitHub/GitLab SSO", "Community Support", "2FA", "3 Default Org Roles"],
      tier: 0
    },
    {
      label: "Scale Addon",
      pricing: ["$500 / month"],
      features: [
        "SAML SSO",
        "OIDC SSO",
        "Enforce MFA",
        "Gateway",
        "SOC2 & PenTest Reports",
        "Priority Support",
        "Customization for Secret Sharing"
      ],
      tier: 1
    },
    {
      label: "Enterprise",
      pricing: ["Custom"],
      features: [
        "Everything in Pro +",
        "Dedicated Infrastructure",
        "External KMS",
        "HSM",
        "LDAP",
        "SCIM",
        "User Groups",
        "GitHub Org Sync",
        "Audit Log Streaming (SIEM integration)",
        "Custom Rate Limits",
        "Custom Organization Roles",
        "Project Templates",
        "Instance User Mgmt",
        "FIPS",
        "Custom Security Questionnaires",
        "Custom MSA",
        "Advanced Organization Structure – Sub-orgs",
        "Enterprise App Connections",
        "Enterprise Secret Syncs",
        "Dedicated Support Engineer",
        "99.99% SLA",
        "Payment via invoicing"
      ],
      tier: 2
    }
  ],

  [SubscriptionProducts.SecretManager]: [
    {
      label: "Free",
      pricing: ["$0 / month"],
      features: [
        "Dashboard UI, API, CLI, SDKs",
        "Up to 3 environments",
        "Up to 5 Secret Syncs",
        "Up to 3 projects",
        "Kubernetes Operator",
        "Infisical Agent",
        "Webhooks",
        "Self-hosting or Infisical Cloud",
        "All Integrations (AWS, Vercel, GitHub Actions, GitLab CI/CD, Jenkins, Ansible, etc.)",
        "Secret Referencing and Overrides",
        "Secret Reminders",
        "Secret Sharing"
      ],
      tier: 0
    },
    {
      label: "Pro",
      pricing: ["$18 / identity / month"],
      features: [
        "Everything in Free +",
        "Up to 12 environments",
        "Up to 50 Secret Syncs",
        "PIT Recovery",
        "Smart Security Alerts",
        "IP Allowlisting",
        "Secret Versioning",
        "Secret Access Insights",
        "Higher Rate Limits",
        "Audit Logs - 30 days retention",
        "RBAC with default roles + ability to limit environments with additional privileges",
        "Secret Rotation"
      ],
      tier: 1
    },
    {
      label: "Enterprise",
      pricing: ["Custom"],
      features: [
        "Everything in Pro +",
        "Unlimited environments",
        "KMIP",
        "Dynamic Secrets",
        "AI Security Advisor",
        "Custom Audit Log Retention",
        "Unlimited Custom Project Roles"
      ],
      tier: 2
    }
  ],

  [SubscriptionProducts.CertificateManager]: [
    {
      label: "Free",
      pricing: ["$0.00 / SAN / month", "$0.00 / internal CA / month"],
      features: [
        "Up to 10 Active SANs per organization",
        "Up to 2 Internal CAs per organization",
        "No wildcard SAN allowed",
        "Limit of 2 Basic External CA Integrations per org",
        "Core Internal CA Management",
        "Core Certificate Management",
        "ACME-compatible External CA Integration",
        "API, ACME Enrollment Method",
        "Certificate Dashboard"
      ],
      tier: 0
    },
    {
      label: "Pro",
      pricing: ["$2.00 / SAN / month", "$500.00 / internal CA / month"],
      features: [
        "Everything in Free +",
        "Externally-signed Intermediate CA",
        "Basic CRL support",
        "Certificate Inventory",
        "Certificate Alerting",
        "Certificate Syncs (AWS, Azure KV)",
        "Server-side Auto-Renewal"
      ],
      tier: 1
    },
    {
      label: "Enterprise",
      pricing: ["Custom / SAN / month", "Custom / internal CA / month"],
      features: [
        "Everything in Pro +",
        "Enterprise External CA integrations (e.g. Microsoft AD CS)",
        "Enterprise enrollment methods (EST)",
        "Enterprise Certificate Syncs (Chef)"
      ],
      tier: 2
    }
  ],

  [SubscriptionProducts.SecretScanning]: [
    {
      label: "Free",
      pricing: ["$0.00 / unit / month"],
      features: [
        "CLI & Pre-commit hooks",
        "Git repositories max scanning size: 1 Gb",
        "Remediation tracking",
        "Up to 25 active developers",
        "Up to 1 project"
      ],
      tier: 0
    },
    {
      label: "Pro",
      pricing: ["$7.00 / unit / month"],
      features: [
        "Everything in Free +",
        "Git repositories max scanning size: 12 Gb",
        "Custom detectors - REGEX based: 1 detector included",
        "Continuous monitoring for secret leaks (e.g., GitHub, GitLab, Bitbucket)",
        "Audit Logs - 90 days retention"
      ],
      tier: 1
    },
    {
      label: "Enterprise",
      pricing: ["Custom / unit / month"],
      features: [
        "Everything in Pro + more",
        "Git repositories max scanning size: 100 Gb",
        "GitHub Enterprise server",
        "Custom detectors - REGEX based: Unlimited",
        "Ticketing, Documentation, Messaging, Container Registries"
      ],
      tier: 2
    }
  ],

  [SubscriptionProducts.PAM]: [
    {
      label: "Free",
      pricing: ["$0.00 / unit / month"],
      features: ["Up to 5 units", "Up to 1 project"],
      tier: 0
    },
    {
      label: "Pro",
      pricing: ["$10.00 / unit / month"],
      features: ["Up to 50 units", "Audit Logs - 90 days retention"],
      tier: 1
    },
    {
      label: "Enterprise",
      pricing: ["Custom / unit / month"],
      features: ["Everything in Free/Pro +", "Unlimited units", "SSH Host Groups"],
      tier: 2
    }
  ]
};

type Props = {
  selectedProduct?: SubscriptionProducts;
  onClose: () => void;
};

export const ManagePlansTable = ({
  selectedProduct = SubscriptionProducts.Platform,
  onClose
}: Props) => {
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription();
  // TODO(multi): handle other cases
  const upgradeProductToPro = useUpgradeProductToPro();

  const handleUpgradeClick = async (tier: number) => {
    if (!currentOrg) return;

    if (tier === 2) {
      // Enterprise - contact sales
      window.location.href = "mailto:sales@infisical.com";
    } else if (tier === 1) {
      // Pro - open customer portal
      await upgradeProductToPro.mutateAsync({
        product: selectedProduct
      });
      onClose();
    }
  };

  const getCurrentTier = (productId: string): number => {
    const currentPlan = subscription?.productPlans?.[productId];
    if (!currentPlan) return 0;

    if (currentPlan.includes("enterprise")) return 2;
    if (currentPlan.includes("pro")) return 1;
    return 0;
  };

  const productPlans = plans[selectedProduct];
  if (!productPlans) return null;
  const currentTier = getCurrentTier(selectedProduct);

  return (
    <div className="w-full space-y-8">
      <div key={selectedProduct} className="space-y-4">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {productPlans.map((plan) => {
            const isCurrentPlan = currentTier === plan.tier;
            const isHighlighted = plan.tier === 1; // Highlight Pro plan

            return (
              <div
                key={`${selectedProduct}-${plan.tier}`}
                className={`relative flex flex-col rounded-lg border p-6 ${
                  isHighlighted
                    ? "border-primary bg-mineshaft-800 shadow-lg ring-1 ring-primary/20"
                    : "border-mineshaft-600 bg-mineshaft-900"
                }`}
              >
                <div className="mb-4">
                  <h4 className="text-xl font-medium text-mineshaft-100">{plan.label}</h4>
                </div>

                <div className="mb-6 min-h-[80px]">
                  <div className="space-y-2">
                    {plan.pricing.map((priceLine, id) => {
                      const price = priceLine.split(" ")[0];
                      const description = priceLine.replace(price, "").trim();
                      return (
                        <div key={`${selectedProduct}-pricing-${id + 1}`} className="flex flex-col">
                          <div className="flex items-baseline gap-2">
                            <span className="text-2xl font-medium text-mineshaft-100">{price}</span>
                            {description && (
                              <span className="text-sm text-mineshaft-400">{description}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="mb-6 flex-1 space-y-3 border-t border-mineshaft-600 pt-6">
                  {plan.features.map((feature, id) => (
                    <div
                      key={`${selectedProduct}-feature-line-${id + 1}`}
                      className="flex items-start gap-3"
                    >
                      <FontAwesomeIcon
                        icon={faCircleCheck}
                        className="mt-0.5 shrink-0 text-primary"
                      />
                      <span className="text-sm text-mineshaft-300">{feature}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-auto pt-4">
                  {plan.tier === 0 && (
                    <Button variant="outline_bg" isFullWidth disabled>
                      {isCurrentPlan ? "Current Plan" : "Free Plan"}
                    </Button>
                  )}
                  {plan.tier === 2 && (
                    <Button
                      variant={isHighlighted ? "solid" : "outline_bg"}
                      colorSchema="primary"
                      isFullWidth
                      onClick={() => handleUpgradeClick(plan.tier)}
                    >
                      Contact Sales
                    </Button>
                  )}
                  {plan.tier === 1 && (
                    <Button
                      variant={isHighlighted ? "solid" : "outline_bg"}
                      colorSchema="primary"
                      isFullWidth
                      onClick={() => handleUpgradeClick(plan.tier)}
                      isDisabled={isCurrentPlan}
                      isLoading={upgradeProductToPro.isPending}
                    >
                      {isCurrentPlan ? "Current Plan" : "Upgrade to Pro"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
