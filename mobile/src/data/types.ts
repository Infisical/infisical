export type RequestType = "pam-access" | "secret-access" | "cert-request" | "cert-code-signing";

export type RequestStatus = "pending" | "approved" | "rejected" | "expired" | "cancelled";

export type StepStatus = "approved" | "rejected" | "current" | "waiting";

export type ApprovalStep = {
  name: string;
  approvers: string[];
  required: number;
  status: StepStatus;
  decidedBy?: string;
};

export type Decision = { by: string; at: number; comment?: string };

export type ApprovalRequest = {
  id: string;
  type: RequestType;
  status: RequestStatus;
  requesterName: string;
  requesterEmail: string;
  scopeName: string;
  environment?: string;
  isProduction?: boolean;
  resource: string;
  location: string;
  access: string;
  duration?: string;
  reason: string;
  createdAt: number;
  expiresAt?: number;
  policyName?: string;
  steps: ApprovalStep[];
  decision?: Decision;
  awaitingYou: boolean;
  leftQueue?: boolean;
};

export type Activity =
  | { state: "idle" }
  | { state: "approving" | "denying" }
  | { state: "failed"; action: "approve" | "deny"; error: string };
