import { BillingCadence, BillingCatalogProduct, BillingCatalogPlan } from "@app/hooks/api";

import { PlanFeature } from "./ProductUpgradeDialog";

export type PlanPrice = {
  amount: number;
  unit: string;
  compactUnit: string;
  isMonthlyEquivalent: boolean;
};

const PLAN_FEATURE_DESCRIPTIONS: Record<string, string> = {
  environments: "Organize secrets across development stages and deployment targets.",
  integrations: "Connect Infisical with infrastructure, cloud, and developer tools.",
  "audit log retention": "Keep organization activity history available for longer.",
  "honey tokens": "Detect unauthorized access with decoy secrets.",
  "secret versioning": "Track and restore previous versions of secrets.",
  "point-in-time recovery": "Restore secrets to an earlier state after unwanted changes.",
  rbac: "Control access with custom roles and granular permissions.",
  "dynamic secrets": "Issue short-lived credentials on demand.",
  "temporary access": "Grant time-bound access without permanent permissions.",
  gateways: "Connect Infisical securely to private infrastructure.",
  "sso/mfa enforcement": "Require centralized sign-in and stronger authentication.",
  scim: "Provision and deprovision users from your identity provider.",
  kmip: "Manage cryptographic keys through KMIP-compatible systems.",
  "audit log streaming": "Send audit activity to external monitoring systems.",
  "sub-organizations": "Separate teams or environments under one organization.",
  "certificate authorities": "Connect or operate certificate authorities from one control plane.",
  "internal certificate authorities":
    "Operate Infisical-managed root and intermediate authorities.",
  certificates: "Issue, renew, and centrally manage certificates.",
  "wildcard certificates": "Issue certificates that secure multiple subdomains.",
  "subject alternative names": "Secure additional hostnames and identities on one certificate.",
  "certificate enrollment": "Enroll workloads and devices through standard certificate protocols.",
  "certificate syncs": "Deliver certificates automatically to infrastructure and cloud providers.",
  "certificate discovery": "Find and inventory certificates across your infrastructure.",
  "code signing": "Protect software releases with centrally managed signing keys.",
  "approval policies": "Require review before sensitive certificate operations proceed.",
  "post-quantum cryptography": "Issue certificates with post-quantum key algorithms.",
  "pam accounts": "Manage privileged accounts and their credentials centrally.",
  "enterprise pam accounts":
    "Connect enterprise account types such as Windows and Active Directory.",
  "slack notifications": "Notify teams when privileged access is requested or changed."
};

const PAM_FEATURE_DESCRIPTIONS: Record<string, string> = {
  "privileged accounts": "Manage privileged accounts and their credentials centrally.",
  "access requests": "Request access to privileged accounts before starting a session.",
  "approval workflows": "Require approval before privileged access is granted.",
  "cli-based resource access": "Connect to privileged resources from the Infisical CLI.",
  "ssh certificate authentication": "Authenticate SSH sessions with short-lived certificates.",
  "privileged credential rotation":
    "Rotate privileged credentials without distributing them to users.",
  "command blocking": "Block restricted commands during privileged sessions.",
  "automated privileged account discovery": "Find privileged accounts across your infrastructure.",
  "enterprise resources (windows, rdp)":
    "Connect to Windows servers and other enterprise resources.",
  "audit logs": "Track privileged access requests and session activity.",
  "session recording": "Record privileged sessions for review and investigation.",
  "session-log masking": "Mask sensitive information in session logs.",
  "log & session recording retention":
    "Keep audit logs and session recordings available for review.",
  "siem audit-log streaming": "Send audit activity to your security monitoring systems.",
  ldap: "Connect your directory for centralized identity management."
};

const getPlanFeatureDescription = (label: string, productKey: string) => {
  const key = label.trim().toLowerCase();
  return (
    (productKey === "pam" ? PAM_FEATURE_DESCRIPTIONS[key] : undefined) ??
    PLAN_FEATURE_DESCRIPTIONS[key]
  );
};

export const planSupportsCadence = (plan: BillingCatalogPlan, cadence: BillingCadence) => {
  const basePrice = plan.base?.[cadence] ?? 0;
  return basePrice > 0 || plan.dims.some((dimension) => dimension[cadence] > 0);
};

export const getPlanPrice = (plan: BillingCatalogPlan, cadence: BillingCadence): PlanPrice => {
  const basePrice = plan.base?.[cadence] ?? 0;
  if (basePrice > 0) {
    return {
      amount: cadence === "annual" ? basePrice / 12 : basePrice,
      unit: "/ month",
      compactUnit: "/mo",
      isMonthlyEquivalent: true
    };
  }

  const dimension = plan.dims.find((candidate) => candidate[cadence] > 0);
  if (!dimension) {
    return { amount: 0, unit: "", compactUnit: "", isMonthlyEquivalent: false };
  }

  const isMetered =
    cadence === "annual" ? dimension.meteredAnnual === true : dimension.meteredMonthly === true;
  const isMonthlyEquivalent = cadence === "monthly" || !isMetered;
  const period = isMonthlyEquivalent ? "month" : "year";
  const noun = dimension.key === "pam_identities" ? "PAM identity" : dimension.noun;

  return {
    amount: cadence === "annual" && !isMetered ? dimension.annual / 12 : dimension[cadence],
    unit: `/ ${noun} / ${period}`,
    compactUnit: `/${noun}/${period === "month" ? "mo" : "yr"}`,
    isMonthlyEquivalent
  };
};

export const annualSavingsPercent = (plan: BillingCatalogPlan) => {
  const monthly = getPlanPrice(plan, "monthly");
  const annual = getPlanPrice(plan, "annual");
  if (
    monthly.amount <= 0 ||
    annual.amount <= 0 ||
    !monthly.isMonthlyEquivalent ||
    !annual.isMonthlyEquivalent
  ) {
    return 0;
  }

  return Math.max(Math.round((1 - annual.amount / monthly.amount) * 100), 0);
};

export const getEffectiveCadence = (
  plan: BillingCatalogPlan,
  cadence: BillingCadence
): BillingCadence => {
  if (planSupportsCadence(plan, cadence)) {
    return cadence;
  }
  if (planSupportsCadence(plan, "annual")) {
    return "annual";
  }
  return "monthly";
};

export const getPlanFeatures = (
  product: BillingCatalogProduct,
  plan: BillingCatalogPlan
): PlanFeature[] => {
  const comparedFeatures = (product.compare ?? []).flatMap<PlanFeature>((row) => {
    const value = row.cells[plan.tier];
    if (value === false || value === undefined || value === 0) {
      return [];
    }
    if (value === true) {
      return [{ label: row.label, description: getPlanFeatureDescription(row.label, product.id) }];
    }
    return [
      {
        label: row.label,
        value: typeof value === "number" ? value.toLocaleString("en-US") : String(value),
        description: getPlanFeatureDescription(row.label, product.id)
      }
    ];
  });

  if (comparedFeatures.length > 0) {
    return comparedFeatures;
  }

  return (product.includes ?? []).map((label) => ({
    label,
    description: getPlanFeatureDescription(label, product.id)
  }));
};
