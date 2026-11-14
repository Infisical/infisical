// UI-only view types for the billing page. BillingMode mirrors overview.mode; BillingRenderState
// is the subscription state plus the local loading/error render states the page switches on.
export type BillingMode = "self-serve" | "managed";

export type BillingRenderState =
  | "active"
  | "trialing"
  | "past-due"
  | "suspended"
  | "no-subscription"
  | "loading"
  | "error";
