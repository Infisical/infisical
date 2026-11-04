import { BadRequestError } from "@app/lib/errors";
import { TOrgDALFactory } from "@app/services/org/org-dal";

// Only a newly attached individual gateway is rejected. Keeping the one a resource already has
// stays allowed, since clients re-send unchanged values on every save and resources created
// before the policy was enabled must stay editable.
export const assertIndividualGatewayAllowed = async ({
  orgDAL,
  orgId,
  gatewayId,
  previousGatewayId,
  inheritedFrom
}: {
  orgDAL: Pick<TOrgDALFactory, "findById">;
  orgId: string;
  gatewayId: string | null | undefined;
  previousGatewayId?: string | null;
  // Names what the gateway was copied from (such as a template), so the error points at what to fix.
  inheritedFrom?: string;
}) => {
  if (!gatewayId || gatewayId === previousGatewayId) return;

  const org = await orgDAL.findById(orgId);
  if (org?.requireGatewayPools && inheritedFrom) {
    throw new BadRequestError({
      message: `${inheritedFrom} uses an individual gateway, but your organization requires resources to connect through a gateway pool. Update it to use a gateway pool, or ask an organization admin to turn off Require Gateway Pools under Organization Settings > Networking.`
    });
  }
  if (org?.requireGatewayPools) {
    throw new BadRequestError({
      message:
        "Your organization requires resources to connect through a gateway pool. Select a gateway pool instead of an individual gateway, or ask an organization admin to turn off Require Gateway Pools under Organization Settings > Networking."
    });
  }
};
