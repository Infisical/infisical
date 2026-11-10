export type TUsageSnapshot = {
  dimension_key: string;
  value: number;
  observed_at: string;
  idempotency_key: string;
  source: string;
};

// One metered fact for a sum or count meter. The license server dedups on event_id, so a retry must
// resend the same id; quantity is ignored for a count meter, which counts each event once.
export type TUsageEvent = {
  event_id: string;
  dimension_key: string;
  quantity: number;
  occurred_at: string;
  source: string;
};

export type TUsageEventResult = {
  event_id: string;
  status: "accepted" | "deduped";
};

// The license server's per-request cap on usage events.
export const MAX_USAGE_EVENTS_PER_REQUEST = 1000;

// Carries the license server's HTTP status + parsed message so callers can special-case responses
// (e.g. swallow a 422 "not priced by any active product on this license") instead of retrying.
export class UsageReportError extends Error {
  readonly status: number;

  readonly serverMessage: string;

  constructor(status: number, serverMessage: string, requestId?: string) {
    super(
      `license-client: [licenseRequestId=${requestId || "unknown"}] usage report failed with ${status}${serverMessage ? `: ${serverMessage}` : ""}`
    );
    this.name = "UsageReportError";
    this.status = status;
    this.serverMessage = serverMessage;
  }
}
