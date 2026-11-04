import { InfoIcon } from "lucide-react";

import { Alert, AlertDescription } from "@app/components/v3";
import {
  OrgPermissionBillingActions,
  OrgPermissionSubjects,
  useOrganization,
  useOrgPermission
} from "@app/context";
import { BillingV2BreakdownDimension, useGetBillingV2Overview } from "@app/hooks/api";
import {
  dimMonthlyRate,
  fmtMoneyCents
} from "@app/pages/organization/BillingV2Page/billing-v2-format";

const IDENTITY_DIMENSIONS: string[] = [
  BillingV2BreakdownDimension.SecretIdentities,
  BillingV2BreakdownDimension.Identities
];

type Props = {
  kind: "member" | "machine-identity";
  count?: number;
};

export const BillableIdentityNotice = ({ kind, count = 1 }: Props) => {
  const { currentOrg, isSubOrganization } = useOrganization();
  const { permission } = useOrgPermission();
  const canReadBilling = permission.can(
    OrgPermissionBillingActions.Read,
    OrgPermissionSubjects.Billing
  );
  const { data: overview } = useGetBillingV2Overview(currentOrg.rootOrgId ?? currentOrg.id, {
    enabled: canReadBilling && !isSubOrganization
  });

  const dim = Object.values(overview?.entitlements ?? {})
    .filter((entitlement) => entitlement.entitled)
    .flatMap((entitlement) => entitlement.dimensions ?? [])
    .find((candidate) => IDENTITY_DIMENSIONS.includes(candidate.key));
  if (!dim) return null;

  const rate = dimMonthlyRate(dim);
  const quantity = Math.max(count, 1);
  const coveredByCommitment = dim.committed !== null && dim.used + quantity <= dim.committed;
  if (rate <= 0 || coveredByCommitment) return null;

  const amount = fmtMoneyCents(rate * quantity);

  return (
    <Alert variant="info">
      <InfoIcon />
      <AlertDescription>
        {kind === "machine-identity"
          ? `Every machine identity is billed on your plan, so creating this one adds ${amount} per month.`
          : `Every member is billed on your plan once they accept, so ${
              quantity === 1 ? "this invite adds" : `these ${quantity} invites add`
            } up to ${amount} per month.`}
      </AlertDescription>
    </Alert>
  );
};
