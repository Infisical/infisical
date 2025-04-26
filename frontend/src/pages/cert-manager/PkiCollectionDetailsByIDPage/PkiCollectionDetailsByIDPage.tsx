import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Button,
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  PageHeader,
  Tooltip
} from "@app/components/v2";
import { ROUTE_PATHS } from "@app/const/routes";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { useDeletePkiCollection, useGetPkiCollectionById } from "@app/hooks/api";
import { PkiItemType } from "@app/hooks/api/pkiCollections/constants";
import { ProjectType } from "@app/hooks/api/workspace/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { PkiCollectionModal } from "../AlertingPage/components/PkiCollectionModal";
import { PkiCollectionDetailsSection, PkiCollectionItemsSection } from "./components";

export const PkiCollectionPage = () => {
  const navigate = useNavigate();
  const params = useParams({
    from: ROUTE_PATHS.CertManager.PkiCollectionDetailsByIDPage.id
  });
  const collectionId = params.collectionId as string;
  const { currentWorkspace } = useWorkspace();
  const projectId = currentWorkspace?.id || "";

  const { data } = useGetPkiCollectionById(collectionId);
  const { mutateAsync: deletePkiCollection } = useDeletePkiCollection();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "pkiCollection",
    "deletePkiCollection"
  ] as const);

  const onDeletePkiCollectionSubmit = async (collectionIdToDelete: string) => {
    try {
      if (!projectId) return;

      await deletePkiCollection({
        projectId,
        collectionId: collectionIdToDelete
      });

      createNotification({
        text: "Successfully deleted PKI collection",
        type: "success"
      });
      handlePopUpClose("deletePkiCollection");
      navigate({
        to: `/${ProjectType.CertificateManager}/$projectId/overview` as const,
        params: {
          projectId
        }
      });
    } catch {
      createNotification({
        text: "Failed to delete PKI collection",
        type: "error"
      });
    }
  };

  return (
    <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      {data && (
        <div className="mx-auto mb-6 w-full max-w-7xl">
          <PageHeader title={data.name}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild className="rounded-lg">
                <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                  <Tooltip content="More options">
                    <Button variant="outline_bg">More</Button>
                  </Tooltip>
                </div>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="p-1">
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Edit}
                  a={ProjectPermissionSub.PkiCollections}
                >
                  {(isAllowed) => (
                    <DropdownMenuItem
                      className={twMerge(
                        !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                      )}
                      onClick={() => {
                        handlePopUpOpen("pkiCollection", {
                          collectionId
                        });
                      }}
                      disabled={!isAllowed}
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
                      className={twMerge(
                        isAllowed
                          ? "hover:!bg-red-500 hover:!text-white"
                          : "pointer-events-none cursor-not-allowed opacity-50"
                      )}
                      onClick={() =>
                        handlePopUpOpen("deletePkiCollection", {
                          collectionId: data.id,
                          name: data.name
                        })
                      }
                      disabled={!isAllowed}
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
      <DeleteActionModal
        isOpen={popUp.deletePkiCollection.isOpen}
        title={`Are you sure want to delete the PKI collection ${data?.name ?? ""}?`}
        onChange={(isOpen) => handlePopUpToggle("deletePkiCollection", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onDeletePkiCollectionSubmit(
            (popUp.deletePkiCollection.data as { collectionId: string })?.collectionId
          )
        }
      />
    </div>
  );
};

export const PkiCollectionDetailsByIDPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: "PKI Collection" })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
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
