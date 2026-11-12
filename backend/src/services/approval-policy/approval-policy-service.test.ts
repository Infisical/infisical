import { describe, expect, it, vi } from "vitest";

import { TApprovalRequests } from "@app/db/schemas";

import { ApprovalPolicyType, ApprovalRequestStatus } from "./approval-policy-enums";
import { approvalPolicyServiceFactory } from "./approval-policy-service";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));

type TDeps = Parameters<typeof approvalPolicyServiceFactory>[0];
type TStoredRequest = Pick<TApprovalRequests, "id" | "type" | "status">;
type TRequestFilter = { $in?: { id?: string[] }; type?: string; status?: string };

const buildService = (requests: TStoredRequest[]) => {
  const store = new Map(requests.map((request) => [request.id, { ...request }]));
  const approvalRequestDAL = {
    update: vi.fn().mockImplementation(async (filter: TRequestFilter, data: Partial<TStoredRequest>) => {
      const matched = [...store.values()].filter(
        (request) =>
          (!filter.$in?.id || filter.$in.id.includes(request.id)) &&
          (!filter.type || request.type === filter.type) &&
          (!filter.status || request.status === filter.status)
      );
      return matched.map((request) => {
        const updated = { ...request, ...data };
        store.set(request.id, updated);
        return updated;
      });
    })
  };
  const certRequestResource = { postRejectionRoutine: vi.fn().mockResolvedValue(undefined) };
  const revocationResource = { postRejectionRoutine: vi.fn().mockResolvedValue(undefined) };

  const service = approvalPolicyServiceFactory({
    approvalRequestDAL,
    resources: {
      [ApprovalPolicyType.CertRequest]: certRequestResource,
      [ApprovalPolicyType.CertRevocation]: revocationResource
    }
  } as unknown as TDeps);

  return { service, certRequestResource, revocationResource, statusOf: (id: string) => store.get(id)?.status };
};

describe("approvalPolicyService.cancelPendingRequests", () => {
  it("cancels the named pending requests of the type and runs each one's rejection routine", async () => {
    const ctx = buildService([
      { id: "renewal-1", type: ApprovalPolicyType.CertRequest, status: ApprovalRequestStatus.Pending },
      { id: "renewal-2", type: ApprovalPolicyType.CertRequest, status: ApprovalRequestStatus.Pending },
      { id: "renewal-3", type: ApprovalPolicyType.CertRequest, status: ApprovalRequestStatus.Pending }
    ]);

    const cancelled = await ctx.service.cancelPendingRequests(ApprovalPolicyType.CertRequest, [
      "renewal-1",
      "renewal-2"
    ]);

    expect(cancelled.map((request) => request.id).sort()).toEqual(["renewal-1", "renewal-2"]);
    expect(ctx.statusOf("renewal-1")).toBe(ApprovalRequestStatus.Cancelled);
    expect(ctx.statusOf("renewal-2")).toBe(ApprovalRequestStatus.Cancelled);
    expect(ctx.statusOf("renewal-3")).toBe(ApprovalRequestStatus.Pending);
    expect(ctx.certRequestResource.postRejectionRoutine).toHaveBeenCalledTimes(2);
    expect(ctx.certRequestResource.postRejectionRoutine).toHaveBeenCalledWith(
      expect.objectContaining({ id: "renewal-1", status: ApprovalRequestStatus.Cancelled })
    );
  });

  it("leaves requests that were already decided or belong to another type alone", async () => {
    const ctx = buildService([
      { id: "renewal-approved", type: ApprovalPolicyType.CertRequest, status: ApprovalRequestStatus.Approved },
      { id: "revocation-1", type: ApprovalPolicyType.CertRevocation, status: ApprovalRequestStatus.Pending }
    ]);

    const cancelled = await ctx.service.cancelPendingRequests(ApprovalPolicyType.CertRequest, [
      "renewal-approved",
      "revocation-1"
    ]);

    expect(cancelled).toEqual([]);
    expect(ctx.statusOf("renewal-approved")).toBe(ApprovalRequestStatus.Approved);
    expect(ctx.statusOf("revocation-1")).toBe(ApprovalRequestStatus.Pending);
    expect(ctx.certRequestResource.postRejectionRoutine).not.toHaveBeenCalled();
    expect(ctx.revocationResource.postRejectionRoutine).not.toHaveBeenCalled();
  });

  it("still cancels every request when one rejection routine fails", async () => {
    const ctx = buildService([
      { id: "renewal-1", type: ApprovalPolicyType.CertRequest, status: ApprovalRequestStatus.Pending },
      { id: "renewal-2", type: ApprovalPolicyType.CertRequest, status: ApprovalRequestStatus.Pending }
    ]);
    ctx.certRequestResource.postRejectionRoutine.mockRejectedValueOnce(new Error("connection terminated"));

    const cancelled = await ctx.service.cancelPendingRequests(ApprovalPolicyType.CertRequest, [
      "renewal-1",
      "renewal-2"
    ]);

    expect(cancelled).toHaveLength(2);
    expect(ctx.certRequestResource.postRejectionRoutine).toHaveBeenCalledTimes(2);
  });
});
