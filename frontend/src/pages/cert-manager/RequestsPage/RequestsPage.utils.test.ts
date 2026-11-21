import { describe, expect, it } from "vitest";

import { ApprovalPolicyType } from "@app/hooks/api/approvalPolicies/types";
import { ApprovalRequestStatus, TApprovalRequest } from "@app/hooks/api/approvalRequests/types";

import { matchesApplicationRequestSearch } from "./RequestsPage.utils";

const SERIAL = "4f1a9c2be07d";

const certificateActionRequest = (
  type: ApprovalPolicyType.CertRevocation | ApprovalPolicyType.CertDeletion,
  certificate: { commonName: string; altNames?: string; friendlyName?: string }
) =>
  ({
    id: "request-1",
    type,
    status: ApprovalRequestStatus.Pending,
    requesterName: "Bob Operator",
    requesterEmail: "bob@example.com",
    requestData: {
      version: 1,
      requestData: {
        certificateId: "cert-1",
        serialNumber: SERIAL,
        profileId: "profile-1",
        profileName: "web-servers",
        applicationId: "app-1",
        ...certificate
      }
    }
  }) as TApprovalRequest;

describe("matchesApplicationRequestSearch", () => {
  it.each([ApprovalPolicyType.CertRevocation, ApprovalPolicyType.CertDeletion] as const)(
    "finds a %s request for a named certificate by its full serial number",
    (type) => {
      const request = certificateActionRequest(type, {
        commonName: "",
        altNames: "api.example.com",
        friendlyName: "payments api"
      });

      expect(matchesApplicationRequestSearch(request, SERIAL)).toBe(true);
    }
  );

  it("matches the serial number however the certificate page formats it", () => {
    const request = certificateActionRequest(ApprovalPolicyType.CertDeletion, {
      commonName: "web.example.com"
    });

    expect(matchesApplicationRequestSearch(request, "4F:1A:9C:2B:E0:7D")).toBe(true);
    expect(matchesApplicationRequestSearch(request, "4F1A9C")).toBe(true);
  });

  it("still finds a request by certificate name, profile and requester", () => {
    const request = certificateActionRequest(ApprovalPolicyType.CertDeletion, {
      commonName: "web.example.com"
    });

    expect(matchesApplicationRequestSearch(request, "WEB.example")).toBe(true);
    expect(matchesApplicationRequestSearch(request, "web-servers")).toBe(true);
    expect(matchesApplicationRequestSearch(request, "bob@example")).toBe(true);
    expect(matchesApplicationRequestSearch(request, "unrelated")).toBe(false);
  });
});
