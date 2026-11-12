// The License Server's usage API, as it goes over the wire. Nothing outside this client reads these.

export type TUsageSnapshotBody = {
  dimension_key: string;
  value: number;
  observed_at: string;
  idempotency_key: string;
  source: string;
};

// One metered fact for a sum or count meter. The license server dedups on event_id, so a retry must
// resend the same id; quantity is ignored for a count meter, which counts each event once.
export type TUsageEventBody = {
  event_id: string;
  dimension_key: string;
  quantity: number;
  occurred_at: string;
  source: string;
};

export type TUsageEventResultBody = {
  event_id: string;
  status: "accepted" | "deduped";
};

// Carries the license server's HTTP status and parsed message, so the client can tell a final no from
// something worth retrying.
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

export const isLicenseNotFound = (error: UsageReportError) =>
  error.status === 404 && error.serverMessage.includes("license not found");

export const isDimensionNotPriced = (error: UsageReportError) =>
  error.status === 422 && error.serverMessage.includes("not priced by any active product on this license");
