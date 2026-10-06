import { ShieldCheck } from "lucide-react";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldTitle,
  Toggle
} from "@app/components/v3";
import {
  OrgPermissionActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { usePopUp } from "@app/hooks";
import { useUpdateOrg } from "@app/hooks/api/organization/queries";

export const GatewayPoliciesSection = () => {
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription();
  const { mutateAsync: updateOrg, isPending } = useUpdateOrg();
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["upgradePlan"] as const);

  const isPoolRequired = Boolean(currentOrg?.requireGatewayPools);

  const handleToggle = async (state: boolean) => {
    if (!currentOrg?.id) return;

    if (state && !subscription?.gatewayPool) {
      handlePopUpOpen("upgradePlan");
      return;
    }

    await updateOrg({ orgId: currentOrg.id, requireGatewayPools: state });

    createNotification({
      text: state
        ? "Resources in this organization now require a gateway pool"
        : "Resources in this organization can now use individual gateways",
      type: "success"
    });
  };

  return (
    <>
      <Card>
        <CardHeader className="border-b">
          <CardTitle>
            <ShieldCheck className="size-4 text-accent" />
            Enforcement
            {isPoolRequired && <Badge variant="success">Active</Badge>}
          </CardTitle>
          <CardDescription>
            Control how resources in your organization use gateways.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>Require Gateway Pools</FieldTitle>
                <FieldDescription>
                  Only allow resources to connect through a gateway pool, not an individual gateway.
                  Resources already using an individual gateway keep working.
                </FieldDescription>
              </FieldContent>
              <OrgPermissionCan I={OrgPermissionActions.Edit} a={OrgPermissionSubjects.Settings}>
                {(isAllowed) => (
                  <Toggle
                    id="require-gateway-pools"
                    variant="org"
                    checked={isPoolRequired}
                    onCheckedChange={handleToggle}
                    disabled={!isAllowed || isPending}
                  />
                )}
              </OrgPermissionCan>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
      <UpgradePlanModal
        paywallKey="organization.gateway.require-pools"
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="Your current plan does not include access to gateway pools. To unlock this feature, please upgrade to Infisical Enterprise plan."
        isEnterpriseFeature
      />
    </>
  );
};
