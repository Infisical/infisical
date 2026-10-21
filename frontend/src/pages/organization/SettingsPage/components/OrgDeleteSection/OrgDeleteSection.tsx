import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Trash2Icon, TriangleAlert } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  Button,
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label
} from "@app/components/v3";
import { useOrganization, useOrgPermission } from "@app/context";
import { OrgMembershipRole } from "@app/helpers/roles";
import { useDeleteOrgById } from "@app/hooks/api";
import { clearSession } from "@app/hooks/api/users/queries";
import { usePopUp } from "@app/hooks/usePopUp";

const CONFIRM_KEYWORD = "confirm";

export const OrgDeleteSection = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { hasOrgRole } = useOrgPermission();

  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp(["deleteOrg"] as const);
  const [confirmInput, setConfirmInput] = useState("");

  const { mutateAsync, isPending } = useDeleteOrgById();

  const isAdmin = hasOrgRole(OrgMembershipRole.Admin);

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
          Permanently delete this organization and all of its data. This action cannot be undone.
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
      <AlertDialog
        open={popUp.deleteOrg.isOpen}
        onOpenChange={(isOpen) => {
          handlePopUpToggle("deleteOrg", isOpen);
          setConfirmInput("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <TriangleAlert />
            </AlertDialogMedia>
            <AlertDialogTitle>Delete {currentOrg?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanently remove {currentOrg?.name} and all of its data. This action is not
              reversible, so please be careful.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="delete-org-confirm">
              Type <span className="font-bold">{CONFIRM_KEYWORD}</span> to confirm
            </Label>
            <Input
              id="delete-org-confirm"
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              autoComplete="off"
              placeholder={`Type ${CONFIRM_KEYWORD} here`}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              disabled={confirmInput !== CONFIRM_KEYWORD || isPending}
              onClick={handleDeleteOrgSubmit}
            >
              Delete Organization
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
