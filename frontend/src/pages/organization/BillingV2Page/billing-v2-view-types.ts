// UI-only view types for the billing page. BillingV2Mode mirrors overview.mode; BillingV2RenderState
// is the subscription state plus the local loading/error render states the page switches on.
export type BillingV2Mode = "self-serve" | "managed";

export type BillingV2RenderState =
  | "active"
  | "trialing"
  | "past-due"
  | "suspended"
  | "no-subscription"
  | "loading"
  | "error";
