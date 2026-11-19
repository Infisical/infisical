import { BadRequestError } from "@app/lib/errors";

import { assertIndividualGatewayAllowed } from "./gateway-pool-policy-fns";

const orgDALWith = (requireGatewayPools: boolean) => ({
  findById: vi.fn().mockResolvedValue({ id: "org-1", requireGatewayPools })
});

describe("assertIndividualGatewayAllowed", () => {
  test("rejects a newly attached gateway when the org requires pools", async () => {
    await expect(
      assertIndividualGatewayAllowed({ orgDAL: orgDALWith(true), orgId: "org-1", gatewayId: "gw-1" })
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  test("allows a gateway when the org does not require pools", async () => {
    await expect(
      assertIndividualGatewayAllowed({ orgDAL: orgDALWith(false), orgId: "org-1", gatewayId: "gw-1" })
    ).resolves.toBeUndefined();
  });

  test("allows keeping the gateway a resource already had, so existing resources stay editable", async () => {
    const orgDAL = orgDALWith(true);
    await expect(
      assertIndividualGatewayAllowed({ orgDAL, orgId: "org-1", gatewayId: "gw-1", previousGatewayId: "gw-1" })
    ).resolves.toBeUndefined();
    expect(orgDAL.findById).not.toHaveBeenCalled();
  });

  test("rejects switching to a different individual gateway when the org requires pools", async () => {
    await expect(
      assertIndividualGatewayAllowed({
        orgDAL: orgDALWith(true),
        orgId: "org-1",
        gatewayId: "gw-2",
        previousGatewayId: "gw-1"
      })
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  test("names the template when the gateway was copied from one, so the user knows what to fix", async () => {
    await expect(
      assertIndividualGatewayAllowed({
        orgDAL: orgDALWith(true),
        orgId: "org-1",
        gatewayId: "gw-1",
        inheritedFrom: "Auth template 'prod-k8s'"
      })
    ).rejects.toThrow("Auth template 'prod-k8s' uses an individual gateway");
  });

  test("does nothing when no individual gateway is being attached", async () => {
    const orgDAL = orgDALWith(true);
    await expect(assertIndividualGatewayAllowed({ orgDAL, orgId: "org-1", gatewayId: null })).resolves.toBeUndefined();
    expect(orgDAL.findById).not.toHaveBeenCalled();
  });
});
