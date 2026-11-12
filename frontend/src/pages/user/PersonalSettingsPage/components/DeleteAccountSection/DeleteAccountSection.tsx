import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Trash2Icon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ConfirmationAlertDialog
} from "@app/components/v3";
import { useDeleteMe, useGetMyDeletionEligibility } from "@app/hooks/api";
import { TUserDeletionEligibility } from "@app/hooks/api/users/types";

const DELETE_CONFIRMATION = "delete my account";

const OrgList = ({ orgs }: { orgs: { id: string; name: string }[] }) => (
  <ul className="list-disc pl-5">
    {orgs.map((org) => (
      <li key={org.id} className="font-medium text-foreground">
        {org.name}
      </li>
    ))}
  </ul>
);

const BlockedReasons = ({ eligibility }: { eligibility: TUserDeletionEligibility }) => (
  <div className="flex flex-col gap-2">
    {eligibility.isOnlyServerAdmin && (
      <p>
        You are the only server admin on this instance. Promote another user to server admin first.
      </p>
    )}
    {eligibility.lastAdminOrganizations.length > 0 && (
      <>
        <p>
          You are the only admin of these organizations. Promote another member to admin in each one
          first, so the organization keeps someone who can manage it.
        </p>
        <OrgList orgs={eligibility.lastAdminOrganizations} />
      </>
    )}
  </div>
);

export const DeleteAccountSection = () => {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  const { mutateAsync: deleteUserMutateAsync, isPending } = useDeleteMe();
  const {
    data: eligibility,
    isFetching: isLoadingEligibility,
    refetch: refetchEligibility
  } = useGetMyDeletionEligibility({ enabled: false });

  const lastMemberOrgs = eligibility?.lastMemberOrganizations ?? [];
  const deletesOrgs = lastMemberOrgs.length > 0;
  const isBlocked = eligibility ? !eligibility.canDelete : false;

  const handleOpen = async () => {
    const { isSuccess } = await refetchEligibility();
    if (isSuccess) {
      setIsOpen(true);
      return;
    }
    createNotification({
      text: "Couldn't check whether your account can be deleted. Try again.",
      type: "error"
    });
  };

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
      // Global toast already shows the error. Refetch in case the server said no because things changed.
      await refetchEligibility();
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
          <Button variant="danger" size="sm" isPending={isLoadingEligibility} onClick={handleOpen}>
            <Trash2Icon />
            Delete Account
          </Button>
        </CardFooter>
      </Card>

      <AlertDialog open={isOpen && isBlocked} onOpenChange={setIsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You Can&apos;t Delete Your Account Yet</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="w-full">
                {eligibility && <BlockedReasons eligibility={eligibility} />}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ConfirmationAlertDialog
        key={lastMemberOrgs
          .map((org) => org.id)
          .sort()
          .join(",")}
        isOpen={isOpen && !isBlocked}
        onOpenChange={setIsOpen}
        title="Delete Your Account?"
        description={
          deletesOrgs ? (
            <div className="flex flex-col gap-2">
              <p>
                You are the last member of these organizations, so deleting your account also
                permanently deletes them and all of their data. Any subscriptions they have are
                canceled immediately, and any remaining prepaid commitment is forfeited without a
                refund.
              </p>
              <OrgList orgs={lastMemberOrgs} />
              <p>This cannot be undone.</p>
            </div>
          ) : (
            "Your account will permanently lose access to Infisical. This cannot be undone."
          )
        }
        confirmKey={DELETE_CONFIRMATION}
        confirmLabel={deletesOrgs ? "Delete Account and Organizations" : "Delete Account"}
        isPending={isPending || isLoadingEligibility}
        onConfirm={handleDeleteAccountSubmit}
      />
    </>
  );
};
