import { BillingPlan, BillingProduct } from "@app/components/license/UpgradeGate/upgrade-intents";
import { isInfisicalCloud } from "@app/helpers/platform";
import { ProjectType } from "@app/hooks/api/projects/types";

import { SignupProductType } from "./signupProducts";

const STORAGE_KEY = "signup.trialIntent";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const TRIAL_PRODUCTS = {
  "secrets-management": {
    billingProduct: BillingProduct.SecretsManagement,
    projectType: ProjectType.SecretManager,
    plans: [BillingPlan.Pro, BillingPlan.Advanced]
  },
  pam: {
    billingProduct: BillingProduct.Pam,
    projectType: ProjectType.PAM,
    plans: [BillingPlan.Pro]
  }
} as const;

type TrialProductKey = keyof typeof TRIAL_PRODUCTS;

export type SignupTrialIntent = {
  product: TrialProductKey;
  plan: string;
  cycle: "monthly" | "annual";
  savedAt: number;
};

const parseIntent = (value: {
  product?: unknown;
  plan?: unknown;
  cycle?: unknown;
}): Omit<SignupTrialIntent, "savedAt"> | null => {
  const { product, plan, cycle } = value;
  if (typeof product !== "string" || !Object.keys(TRIAL_PRODUCTS).includes(product)) return null;
  const allowedPlans: readonly string[] = TRIAL_PRODUCTS[product as TrialProductKey].plans;
  if (typeof plan !== "string" || !allowedPlans.includes(plan)) return null;
  return {
    product: product as TrialProductKey,
    plan,
    cycle: cycle === "monthly" ? "monthly" : "annual"
  };
};

export const clearSignupTrialIntent = () => localStorage.removeItem(STORAGE_KEY);

export const getSignupTrialIntent = (): SignupTrialIntent | null => {
  if (!isInfisicalCloud()) return null;
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    const intent = stored ? parseIntent(stored) : null;
    if (!intent || typeof stored.savedAt !== "number" || Date.now() - stored.savedAt > MAX_AGE_MS) {
      clearSignupTrialIntent();
      return null;
    }
    return { ...intent, savedAt: stored.savedAt };
  } catch {
    clearSignupTrialIntent();
    return null;
  }
};

export const captureSignupTrialIntent = (search: string) => {
  if (!isInfisicalCloud()) return null;
  const params = new URLSearchParams(search);
  const intent = parseIntent({
    product: params.get("product"),
    plan: params.get("plan"),
    cycle: params.get("cycle")
  });
  if (!intent) return getSignupTrialIntent();
  const captured = { ...intent, savedAt: Date.now() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(captured));
  return captured;
};

export const getSignupTrialProjectType = (intent: SignupTrialIntent | null): SignupProductType[] =>
  intent ? [TRIAL_PRODUCTS[intent.product].projectType] : [];

export const getSignupTrialBillingSearch = (intent: SignupTrialIntent, returnPath: string) => ({
  upgradeProduct: TRIAL_PRODUCTS[intent.product].billingProduct,
  upgradePlan: intent.plan,
  upgradeCycle: intent.cycle,
  upgradeReturnPath: returnPath
});
