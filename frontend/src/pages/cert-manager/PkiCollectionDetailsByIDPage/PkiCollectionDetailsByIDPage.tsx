import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate, useParams } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { PageTitle } from "@app/components/PageTitle";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  ConfirmationAlertDialog,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  PageHeader
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useProject
} from "@app/context";
import { useDeletePkiCollection, useGetPkiCollectionById } from "@app/hooks/api";
import { PkiItemType } from "@app/hooks/api/pkiCollections/constants";
import { ProjectType } from "@app/hooks/api/projects/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { PkiCollectionModal } from "../AlertingPage/components/PkiCollectionModal";
import { PkiCollectionDetailsSection, PkiCollectionItemsSection } from "./components";

export const PkiCollectionPage = () => {
  const navigate = useNavigate();
  const params = useParams({
    from: ROUTE_PATHS.CertManager.PkiCollectionDetailsByIDPage.id
  });
  const collectionId = params.collectionId as string;
  const { currentProject } = useProject();
  const { currentOrg } = useOrganization();
  const projectId = currentProject?.id || "";

  const { data } = useGetPkiCollectionById(collectionId);
  const { mutateAsync: deletePkiCollection } = useDeletePkiCollection();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "pkiCollection",
    "deletePkiCollection"
  ] as const);

  const onDeletePkiCollectionSubmit = async (collectionIdToDelete: string) => {
    if (!projectId) return;

    await deletePkiCollection({
      collectionId: collectionIdToDelete
    });

    createNotification({
      text: "Successfully deleted PKI collection",
      type: "success"
    });
    handlePopUpClose("deletePkiCollection");
    navigate({
      to: "/organizations/$orgId/cert-manager/policies",
      params: {
        orgId: currentOrg.id
      }
    });
  };

  return (
    <div className="mx-auto flex flex-col justify-between bg-page">
      {data && (
        <div className="mx-auto mb-6 flex w-full max-w-8xl flex-col">
          <PageHeader
            backLink={
              <Link
                to="/organizations/$orgId/cert-manager/policies"
                params={{
                  orgId: currentOrg.id
                }}
              >
                <FontAwesomeIcon icon={faChevronLeft} />
                Certificates
              </Link>
            }
            scope={ProjectType.CertificateManager}
            title={data.name}
            description="Manage certificate collection"
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">More</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Edit}
                  a={ProjectPermissionSub.PkiCollections}
                >
                  {(isAllowed) => (
                    <DropdownMenuItem
                      onClick={() => {
                        handlePopUpOpen("pkiCollection", {
                          collectionId
                        });
                      }}
                      isDisabled={!isAllowed}
                    >
                      Edit PKI Collection
                    </DropdownMenuItem>
                  )}
                </ProjectPermissionCan>
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Delete}
                  a={ProjectPermissionSub.PkiCollections}
                >
                  {(isAllowed) => (
                    <DropdownMenuItem
                      onClick={() =>
                        handlePopUpOpen("deletePkiCollection", {
                          collectionId: data.id,
                          name: data.name
                        })
                      }
                      isDisabled={!isAllowed}
                      variant="danger"
                    >
                      Delete PKI Collection
                    </DropdownMenuItem>
                  )}
                </ProjectPermissionCan>
              </DropdownMenuContent>
            </DropdownMenu>
          </PageHeader>
          <div className="flex">
            <div className="mr-4 w-96">
              <PkiCollectionDetailsSection
                collectionId={collectionId}
                handlePopUpOpen={handlePopUpOpen}
              />
            </div>
            <div className="w-full">
              <div className="mb-4">
                <PkiCollectionItemsSection collectionId={collectionId} type={PkiItemType.CA} />
              </div>
              <PkiCollectionItemsSection
                collectionId={collectionId}
                type={PkiItemType.CERTIFICATE}
              />
            </div>
          </div>
        </div>
      )}
      <PkiCollectionModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <ConfirmationAlertDialog
        isOpen={popUp.deletePkiCollection.isOpen}
        description="This action is irreversible."
        title={`Are you sure you want to delete the PKI collection ${data?.name ?? ""}?`}
        onOpenChange={(isOpen) => handlePopUpToggle("deletePkiCollection", isOpen)}
        confirmKey="confirm"
        onConfirm={() =>
          onDeletePkiCollectionSubmit(
            (popUp.deletePkiCollection.data as { collectionId: string })?.collectionId
          )
        }
      />
    </div>
  );
};

export const PkiCollectionDetailsByIDPage = () => {
  return (
    <>
      <PageTitle title="PKI Collection" />
      <link rel="icon" href="/infisical.ico" />
      <ProjectPermissionCan
        renderGuardBanner
        passThrough={false}
        I={ProjectPermissionActions.Read}
        a={ProjectPermissionSub.PkiCollections}
      >
        <PkiCollectionPage />
      </ProjectPermissionCan>
    </>
  );
};
