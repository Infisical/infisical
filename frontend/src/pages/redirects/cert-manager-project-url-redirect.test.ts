import { beforeEach, describe, expect, test, vi } from "vitest";

import { setCertManagerActiveProjectCookie } from "@app/helpers/certManagerActiveProject";

import { Route } from "./cert-manager-project-url-redirect";

vi.mock("@app/helpers/certManagerActiveProject", () => ({
  setCertManagerActiveProjectCookie: vi.fn()
}));

const ORG_ID = "80f23c82-c4bc-4ad6-a6c5-bdba88a45bd7";
const PROJECT_ID = "4e1c693b-6344-405a-bcc6-992ce8b5164c";
const CERTIFICATE_ID = "ca7fa9de-c8a4-4302-99d8-11ed8c3b2e0b";

const redirectHref = (splat: string, searchStr = "") => {
  try {
    Route.options.beforeLoad?.({
      params: { orgId: ORG_ID, projectId: PROJECT_ID, _splat: splat },
      location: { searchStr, hash: "" }
    } as never);
  } catch (thrown) {
    return (thrown as { href: string }).href;
  }
  throw new Error("expected the route to redirect");
};

describe("legacy Certificate Manager project URL redirect", () => {
  beforeEach(() => {
    vi.mocked(setCertManagerActiveProjectCookie).mockClear();
  });

  test("makes the linked project active and opens the certificate a certificate alert links to", () => {
    expect(redirectHref(`certificates/${CERTIFICATE_ID}`)).toBe(
      `/organizations/${ORG_ID}/cert-manager/certificates/${CERTIFICATE_ID}`
    );
    expect(setCertManagerActiveProjectCookie).toHaveBeenCalledWith(ORG_ID, PROJECT_ID);
  });

  test("keeps the query string", () => {
    expect(redirectHref(`certificates/${CERTIFICATE_ID}`, "?fromApplication=payments-api")).toBe(
      `/organizations/${ORG_ID}/cert-manager/certificates/${CERTIFICATE_ID}?fromApplication=payments-api`
    );
  });
});
