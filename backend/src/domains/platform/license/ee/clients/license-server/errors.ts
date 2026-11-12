import { ExternalSystemError, RuleViolationError } from "@app/domains/lib/errors";
import { logger } from "@app/lib/logger";

// Every error raised from a license-server interaction is formatted through here, so one grep on
// licenseRequestId ties a failure in our logs to the exact request in the license server's. The id
// falls back to "unknown" rather than being omitted, so the field is always there to match on.
const LICENSE_REQUEST_ID_HEADER = "x-request-id";

// Carried as the thrown error's name instead of the default "BadRequest"/"InternalServerError", so a
// failure that originated at the license server is attributable without matching on message text (the
// error handler logs error.name and labels the error metrics with it).
const LICENSE_SERVER_ERROR_NAME = "LicenseServerError";

export const readLicenseRequestId = (res: Response): string => res.headers.get(LICENSE_REQUEST_ID_HEADER) ?? "unknown";

export const licenseErrorMessage = (requestId: string, message: string): string =>
  `license-client: [licenseRequestId=${requestId}] ${message}`;

// Friendly, action-oriented copy for the license server's machine error codes (details.code). Resolved
// here so the whole billing surface throws a user-facing message the frontend just renders (no per-code
// branching in the UI). Falls back to the server's own message when the code is unknown/absent.
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

// Surface the license server's message on 4xx (caller-actionable, e.g. "cannot remove the last
// product; cancel the subscription instead"); when it has none, fall back to the generic error
// default rather than a status code the customer can't act on. 5xx bodies may carry internal detail,
// so those stay generic.
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
    // Resolve the contract's machine code (details.code) to friendly copy so the message thrown here is
    // user-facing; keep the code in details for any caller that still branches on it. Otherwise fall back
    // to the envelope's `message`, which is written for the customer (`error` is the class name).
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

// Carries the license server's HTTP status and parsed message, so the client can tell a final no from
// something worth retrying.
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
