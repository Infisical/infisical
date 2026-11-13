import { PlusIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { AddToProductDialog } from "@app/components/organization/ProductAccess";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogConfirmationField,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@app/components/v3";
import {
  useCreateProjectIdentityMembership,
  useDeleteProjectIdentityMembership,
  useGetIdentityProjectMemberships
} from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { getIdentityProjectsFirstPageParams, IdentityProjectsTable } from "./IdentityProjectsTable";

type Props = {
  identityId: string;
};

type RemoveIdentityPopUpData = {
  identityId: string;
  identityName: string;
  projectId: string;
  projectType: ProjectType;
  projectName: string;
};

export const IdentityProjectsSection = ({ identityId }: Props) => {
  const { mutateAsync: deleteMutateAsync, isPending: isRemoving } =
    useDeleteProjectIdentityMembership();
  const { mutateAsync: addIdentityToProject } = useCreateProjectIdentityMembership();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "addIdentityToProduct",
    "removeIdentityFromProject"
  ] as const);

  const {
    data: allProjectMemberships,
    isPending: isAllMembershipsLoading,
    isError: isAllMembershipsError
  } = useGetIdentityProjectMemberships(
    identityId,
    {},
    { enabled: popUp.addIdentityToProduct.isOpen }
  );

  const removeIdentityData = popUp.removeIdentityFromProject.data as
    | RemoveIdentityPopUpData
    | undefined;

  const onRemoveIdentitySubmit = async () => {
    if (!removeIdentityData) return;

    await deleteMutateAsync({
      identityId: removeIdentityData.identityId,
      projectId: removeIdentityData.projectId,
      projectType: removeIdentityData.projectType
    });

    createNotification({
      text: "Successfully removed machine identity",
      type: "success"
    });

    handlePopUpClose("removeIdentityFromProject");
  };

  const { data: projectMemberships } = useGetIdentityProjectMemberships(
    identityId,
    getIdentityProjectsFirstPageParams()
  );

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Products</CardTitle>
          <CardDescription>
            Manage the products and projects this machine identity can access
          </CardDescription>
          {Boolean(projectMemberships?.totalCount) && (
            <CardAction>
              <Button
                onClick={() => {
                  handlePopUpOpen("addIdentityToProduct");
                }}
                size="xs"
                variant="outline"
              >
                <PlusIcon />
                Add to Product
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          <IdentityProjectsTable identityId={identityId} handlePopUpOpen={handlePopUpOpen} />
        </CardContent>
      </Card>
      <AlertDialog
        isPending={isRemoving}
        open={popUp.removeIdentityFromProject.isOpen}
        confirmationValue="confirm"
        onOpenChange={(isOpen) => {
          handlePopUpToggle("removeIdentityFromProject", isOpen);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Machine Identity</AlertDialogTitle>
            <AlertDialogDescription>
              Remove{" "}
              <span className="font-medium text-foreground">
                {removeIdentityData?.identityName ?? "this identity"}
              </span>{" "}
              from{" "}
              <span className="font-medium text-foreground">
                {removeIdentityData?.projectName ?? "this project"}
              </span>
              . The machine identity loses all access it has through this membership.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogConfirmationField
            onConfirm={() => onRemoveIdentitySubmit().catch(() => undefined)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              onClick={(event) => {
                event.preventDefault();
                onRemoveIdentitySubmit().catch(() => undefined);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AddToProductDialog
        isOpen={popUp.addIdentityToProduct.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addIdentityToProduct", isOpen)}
        title="Add Machine Identity to Product"
        actorLabel="machine identity"
        memberProjectIds={allProjectMemberships?.identityMemberships.map(
          ({ project }) => project.id
        )}
        isMembershipsLoading={isAllMembershipsLoading}
        isMembershipsError={isAllMembershipsError}
        onAddToProject={(project, roleSlug) =>
          addIdentityToProject({
            identityId,
            projectId: project.id,
            projectType: project.type,
            role: roleSlug
          })
        }
      />
    </>
  );
};
