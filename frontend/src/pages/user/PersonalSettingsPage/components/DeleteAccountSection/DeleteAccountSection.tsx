import { useState } from "react";
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
import { isInfisicalCloud } from "@app/helpers/platform";
import { useDeleteMe, useGetBillingOverview, useGetLastMemberOrganizations } from "@app/hooks/api";

const DELETE_CONFIRMATION = "delete my account";

export const DeleteAccountSection = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  const { mutateAsync: deleteUserMutateAsync, isPending } = useDeleteMe();
  const {
    data: lastMemberOrgs = [],
    isPending: isLoadingLastMemberOrgs,
    refetch: refetchLastMemberOrgs
  } = useGetLastMemberOrganizations({ enabled: isOpen });

  const deletesOrgs = lastMemberOrgs.length > 0;

  // isCloud describes the instance, so any of the orgs can answer it.
  const overview = useGetBillingOverview(lastMemberOrgs[0]?.id ?? "", { enabled: deletesOrgs });
  const cancelsSubscriptions = overview.data ? overview.data.isCloud : isInfisicalCloud();

  const handleDeleteAccountSubmit = async () => {
    try {
      await deleteUserMutateAsync({
        lastMemberOrganizationIds: lastMemberOrgs.map((org) => org.id)
      });

      createNotification({
        text: "Account deleted.",
        type: "success"
      });

      setIsOpen(false);
      navigate({ to: "/login" });
    } catch {
      // The request error toast carries the reason. The server refuses when the orgs it would delete
      // differ from the ones shown here, so show the current list.
      await refetchLastMemberOrgs();
    }
  };

  return (
    <>
      <Card className="gap-0 overflow-hidden border-danger/25 p-0">
        <CardHeader className="p-6">
          <CardTitle className="font-alliance">Delete Account</CardTitle>
          <CardDescription>
            Permanently delete your account and revoke its access to Infisical. Organizations where
            you are the last member are deleted with it. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardFooter className="min-h-8 justify-end border-t border-danger/15 bg-danger/5 p-4">
          <Button variant="danger" size="sm" onClick={() => setIsOpen(true)}>
            <Trash2Icon />
            Delete account
          </Button>
        </CardFooter>
      </Card>

      <ConfirmationAlertDialog
        isOpen={isOpen}
        onOpenChange={setIsOpen}
        title="Delete your account?"
        description={
          deletesOrgs ? (
            <div className="flex flex-col gap-2">
              <p>
                You are the last member of these organizations, so deleting your account also
                permanently deletes them and all of their data.
                {cancelsSubscriptions &&
                  " Their subscriptions are canceled immediately, and any remaining prepaid commitment is forfeited without a refund."}
              </p>
              <ul className="list-disc pl-5">
                {lastMemberOrgs.map((org) => (
                  <li key={org.id} className="font-medium text-foreground">
                    {org.name}
                  </li>
                ))}
              </ul>
              <p>This cannot be undone.</p>
            </div>
          ) : (
            "Your account will permanently lose access to Infisical. This cannot be undone."
          )
        }
        confirmKey={DELETE_CONFIRMATION}
        confirmLabel={deletesOrgs ? "Delete account and organizations" : "Delete account"}
        isPending={isPending || isLoadingLastMemberOrgs}
        onConfirm={handleDeleteAccountSubmit}
      />
    </>
  );
};
