import { useNavigate } from "@tanstack/react-router";
import { Trash2Icon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ConfirmationAlertDialog
} from "@app/components/v3";
import { useOrganization, useOrgPermission } from "@app/context";
import { isInfisicalCloud } from "@app/helpers/platform";
import { OrgMembershipRole } from "@app/helpers/roles";
import { useDeleteOrgById, useGetBillingOverview } from "@app/hooks/api";
import { clearSession } from "@app/hooks/api/users/queries";
import { usePopUp } from "@app/hooks/usePopUp";

const CONFIRM_KEYWORD = "confirm";

export const OrgDeleteSection = () => {
  const navigate = useNavigate();
  const { currentOrg, isSubOrganization } = useOrganization();
  const { hasOrgRole } = useOrgPermission();

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["deleteOrg"] as const);

  const { mutateAsync, isPending } = useDeleteOrgById();

  const isAdmin = hasOrgRole(OrgMembershipRole.Admin);
  // Only cloud root orgs have their own subscription.
  const overview = useGetBillingOverview(currentOrg?.id ?? "", {
    enabled: isAdmin && !isSubOrganization
  });
  const cancelsSubscription =
    !isSubOrganization && (overview.data ? overview.data.isCloud : isInfisicalCloud());

  const handleDeleteOrgSubmit = async () => {
    if (!currentOrg?.id) return;

    await mutateAsync({
      organizationId: currentOrg?.id
    });

    createNotification({
      text: "Successfully deleted organization",
      type: "success"
    });

    clearSession();
    navigate({ to: "/login" });
  };

  return (
    <Card className="gap-0 overflow-hidden border-danger/25 p-0">
      <CardHeader className="p-6">
        <CardTitle>Danger Zone</CardTitle>
        <CardDescription>
          Permanently delete this organization and all of its data
          {cancelsSubscription && ", and cancel its subscription"}. This action cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardFooter className="min-h-8 justify-end border-t border-danger/15 bg-danger/5 p-4">
        <Button
          size="sm"
          variant="danger"
          isPending={isPending}
          isDisabled={!isAdmin}
          onClick={() => handlePopUpOpen("deleteOrg")}
        >
          <Trash2Icon />
          Delete Organization
        </Button>
      </CardFooter>
      <ConfirmationAlertDialog
        isOpen={popUp.deleteOrg.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("deleteOrg", isOpen)}
        title={`Delete "${currentOrg?.name}"`}
        description={`This permanently deletes the organization and all of its data.${
          cancelsSubscription
            ? " Its subscription is canceled immediately, and any remaining prepaid commitment is forfeited without a refund."
            : ""
        } This cannot be undone.`}
        confirmKey={CONFIRM_KEYWORD}
        confirmLabel="Delete Organization"
        isPending={isPending}
        onConfirm={handleDeleteOrgSubmit}
      />
    </Card>
  );
};
