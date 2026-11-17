import { ExternalSystemError, RuleViolationError } from "@app/domains/lib/errors";
import { logger } from "@app/lib/logger";

// Every license server error is formatted with this id, so grepping licenseRequestId ties our log to the server's.
// It falls back to "unknown" so the field is always there to match on.
const LICENSE_REQUEST_ID_HEADER = "x-request-id";

// Used as the thrown error's name so license server failures show up by name in logs and error metrics
// (the error handler labels them with error.name), not by matching message text.
const LICENSE_SERVER_ERROR_NAME = "LicenseServerError";

export const readLicenseRequestId = (res: Response): string => res.headers.get(LICENSE_REQUEST_ID_HEADER) ?? "unknown";

export const licenseErrorMessage = (requestId: string, message: string): string =>
  `license-client: [licenseRequestId=${requestId}] ${message}`;

// User-facing copy for the license server's details.code, so the frontend just renders the message with no
// per-code branching. Unknown codes fall back to the server's own message.
const BILLING_ERROR_MESSAGES: Record<string, string> = {
  commitment_decrease_locked: "Commitments can't be reduced until the final window before your renewal.",
  cap_exceeded: "That amount is above the limit available on your plan.",
  plan_cadence_not_offered: "Your current plan version doesn't offer this billing option.",
  product_already_held: "You already have this product. Remove it before adding it again.",
  past_due: "There's an unpaid invoice on your account. Resolve payment before making changes.",
  resubscribe_cooldown: "This product was removed recently. Please wait a bit before resubscribing.",
  not_self_serve: "Billing for this organization is managed by our team. Contact sales to make changes.",
  product_not_trialing: "Start this product's trial or activate it before setting an annual commitment.",
  not_an_upgrade: "This plan isn't an upgrade from your current one. Contact support to switch to it.",
  product_not_held: "You don't have this product yet. Add it before changing its plan.",
  product_trialing: "You're on a trial of this product. You can change plans once the trial converts.",
  product_churned: "This product was canceled. Add it again before changing its plan.",
  trial_already_used: "You've already trialed this plan.",
  trial_already_open: "A trial for this product is already running.",
  trial_not_eligible: "You're already on this plan.",
  version_moved: "Prices changed while you were reviewing. Check the new total and try again.",
  commitment_not_portable: "Your annual commitment can't move to that plan. Contact sales to switch.",
  dimension_not_priced: "That plan doesn't price something you're billed for today. Contact support to switch.",
  no_payment_method: "Add a payment method before making this change.",
  subscription_syncing: "Your billing details are still syncing. Please try again in a moment.",
  plan_deprecated: "This plan is being retired and is no longer available.",
  no_trial_awaiting_payment: "There's no trial payment waiting to be completed. It may have already gone through.",
  change_awaiting_payment:
    "You have a payment waiting for your bank's approval. Complete it from the banner above before making another change.",
  lock_held: "Another billing change is in progress. Please try again in a moment."
};

// A 4xx surfaces the friendly copy for details.code, else the server's `message` (written for the customer),
// else a generic one; the code stays in details for callers that branch on it. 5xx bodies may carry internal
// detail, so those stay generic.
export const throwIfResponseError = async (res: Response): Promise<void> => {
  if (res.ok) {
    return;
  }
  const requestId = readLicenseRequestId(res);
  if (res.status >= 400 && res.status < 500) {
    const body = (await res.json().catch(() => null)) as {
      message?: string;
      details?: { code?: string };
    } | null;
    const code = body?.details?.code;
    const message = (code && BILLING_ERROR_MESSAGES[code]) || body?.message;
    logger.warn(licenseErrorMessage(requestId, `request rejected [status=${res.status}] [code=${code ?? "none"}]`));
    throw new RuleViolationError({
      name: LICENSE_SERVER_ERROR_NAME,
      message: licenseErrorMessage(requestId, message ?? "Billing request failed"),
      details: code ? { code } : undefined
    });
  }
  logger.error(licenseErrorMessage(requestId, `request failed [status=${res.status}]`));
  throw new ExternalSystemError({
    name: LICENSE_SERVER_ERROR_NAME,
    message: licenseErrorMessage(requestId, "Billing service error")
  });
};

// Keeps the HTTP status so the client can tell a final no from something worth retrying.
export class UsageReportError extends Error {
  readonly status: number;

  readonly serverMessage: string;

  constructor(status: number, serverMessage: string, requestId?: string) {
    super(
      licenseErrorMessage(
        requestId || "unknown",
        `usage report failed with ${status}${serverMessage ? `: ${serverMessage}` : ""}`
      )
    );
    this.name = "UsageReportError";
    this.status = status;
    this.serverMessage = serverMessage;
  }
}

export const isLicenseNotFound = (error: UsageReportError) =>
  error.status === 404 && error.serverMessage.includes("license not found");

export const isDimensionNotPriced = (error: UsageReportError) =>
  error.status === 422 && error.serverMessage.includes("not priced by any active product on this license");
