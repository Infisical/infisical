import { hostOf } from "../auth/config";
import { ApiError, describeFailure, JsonResponse, requestJson } from "../auth/http";
import { ApprovalRequest, RequestStatus } from "./types";

type PamAccessRequest = {
  id: string;
  status: string;
  requesterName: string;
  requesterEmail: string;
  justification?: string | null;
  createdAt: string;
  expiresAt?: string | null;
  requestData?: {
    version?: number;
    requestData?: { accountId?: string; folderId?: string; reason?: string; duration?: string; accessType?: string };
  };
  accountName: string | null;
  accountType: string | null;
  folderName: string | null;
  accessType?: string;
};

type Auth = {
  instance: string;
  getAccessToken: () => string | null;
  refreshAccessToken: () => Promise<string | null>;
  onSessionEnded: (notice: string) => void;
};

const STATUSES: RequestStatus[] = ["pending", "approved", "rejected", "expired", "cancelled"];

const accessLabel = (accessType?: string) => (accessType === "credential" ? "View credentials" : "Session");

const toApprovalRequest = (row: PamAccessRequest): ApprovalRequest => {
  const data = row.requestData?.requestData;
  const createdAt = Date.parse(row.createdAt);
  const expiresAt = row.expiresAt ? Date.parse(row.expiresAt) : undefined;
  return {
    id: row.id,
    type: "pam-access",
    status: STATUSES.includes(row.status as RequestStatus) ? (row.status as RequestStatus) : "pending",
    awaitingYou: true,
    requesterName: row.requesterName,
    requesterEmail: row.requesterEmail,
    scopeName: row.folderName ?? "No folder",
    resource: row.accountName ?? "Deleted account",
    location: row.folderName ? `/${row.folderName}` : "/",
    access: accessLabel(row.accessType ?? data?.accessType),
    duration: data?.duration,
    reason: data?.reason?.trim() || row.justification?.trim() || "No reason given.",
    createdAt: Number.isNaN(createdAt) ? Date.now() : createdAt,
    expiresAt: expiresAt !== undefined && !Number.isNaN(expiresAt) ? expiresAt : undefined,
    steps: []
  };
};

export const createApiClient = ({ instance, getAccessToken, refreshAccessToken, onSessionEnded }: Auth) => {
  const sessionEnded = () => {
    const notice = `Your session on ${hostOf(instance)} ended. Sign in again to keep reviewing requests.`;
    onSessionEnded(notice);
    return new ApiError(notice);
  };

  const send = (path: string, init: RequestInit, action: string, token: string | null) =>
    requestJson(
      instance,
      path,
      { ...init, headers: { ...init.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) } },
      action
    );

  const call = async (path: string, init: RequestInit, action: string): Promise<JsonResponse> => {
    let response = await send(path, init, action, getAccessToken());
    if (response.status === 401) {
      const token = await refreshAccessToken();
      if (!token) throw sessionEnded();
      response = await send(path, init, action, token);
      if (response.status === 401) throw sessionEnded();
    }
    if (response.status < 200 || response.status >= 300) throw new ApiError(describeFailure(instance, response, action));
    return response;
  };

  return {
    listAwaitingReview: async () => {
      const { body } = await call("/api/v1/pam/access-requests/pending-my-approval", { method: "GET" }, "load your requests");
      const rows = body?.requests;
      if (!Array.isArray(rows))
        throw new ApiError(`${hostOf(instance)} sent a list the app couldn't read. Pull down to try again.`);
      return (rows as PamAccessRequest[]).map(toApprovalRequest);
    },
    decide: async (id: string, action: "approve" | "deny", comment?: string) => {
      await call(
        `/api/v1/approval-policies/pam-access/requests/${encodeURIComponent(id)}/${action === "approve" ? "approve" : "reject"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(comment ? { comment } : {})
        },
        action === "approve" ? "approve this request" : "deny this request"
      );
    }
  };
};
