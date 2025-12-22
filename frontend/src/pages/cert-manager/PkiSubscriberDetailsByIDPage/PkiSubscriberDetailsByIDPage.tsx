import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
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
import {
  ProjectPermissionPkiSubscriberActions,
  ProjectPermissionSub,
  useOrganization,
  useProject
} from "@app/context";
import { useDeletePkiSubscriber, useGetPkiSubscriber } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { PkiSubscriberModal } from "../PkiSubscribersPage/components/PkiSubscriberModal";
import { PkiSubscriberCertificatesSection, PkiSubscriberDetailsSection } from "./components";

const Page = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const projectId = currentProject.id;
  const subscriberName = useParams({
    from: ROUTE_PATHS.CertManager.PkiSubscriberDetailsByIDPage.id,
    select: (el) => el.subscriberName
  });
  const { data } = useGetPkiSubscriber({
    subscriberName,
    projectId
  });

  const { mutateAsync: deletePkiSubscriber } = useDeletePkiSubscriber();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "pkiSubscriber",
    "deletePkiSubscriber"
  ] as const);

  const onRemoveSubscriberSubmit = async (subscriberNameToDelete: string) => {
    if (!projectId) return;

    await deletePkiSubscriber({ subscriberName: subscriberNameToDelete, projectId });

    createNotification({
      text: "Successfully deleted subscriber",
      type: "success"
    });

    handlePopUpClose("deletePkiSubscriber");
    navigate({
      to: "/organizations/$orgId/projects/cert-manager/$projectId/subscribers",
      params: {
        orgId: currentOrg.id,
        projectId
      }
    });
  };

  return (
    <div className="mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      {data && (
        <div className="mx-auto mb-6 w-full max-w-8xl">
          <Link
            to="/organizations/$orgId/projects/cert-manager/$projectId/subscribers"
            params={{
              orgId: currentOrg.id,
              projectId
            }}
            className="mb-4 flex items-center gap-x-2 text-sm text-mineshaft-400"
          >
            <FontAwesomeIcon icon={faChevronLeft} />
            Subscribers
          </Link>
          <PageHeader
            scope={ProjectType.CertificateManager}
            title={data.name}
            description="Manage PKI subscriber"
          >
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
                  I={ProjectPermissionPkiSubscriberActions.Delete}
                  a={ProjectPermissionSub.PkiSubscribers}
                >
                  {(isAllowed) => (
                    <DropdownMenuItem
                      className={twMerge(
                        isAllowed
                          ? "hover:bg-red-500! hover:text-white!"
                          : "pointer-events-none cursor-not-allowed opacity-50"
                      )}
                      onClick={() =>
                        handlePopUpOpen("deletePkiSubscriber", {
                          subscriberName: data.name
                        })
                      }
                      disabled={!isAllowed}
                    >
                      Delete PKI Subscriber
                    </DropdownMenuItem>
                  )}
                </ProjectPermissionCan>
              </DropdownMenuContent>
            </DropdownMenu>
          </PageHeader>
          <div className="flex">
            <div className="mr-4 w-96">
              <PkiSubscriberDetailsSection
                subscriberName={data.name}
                handlePopUpOpen={handlePopUpOpen}
              />
            </div>
            <div className="w-full">
              <PkiSubscriberCertificatesSection subscriberName={data.name} />
            </div>
          </div>
        </div>
      )}
      <PkiSubscriberModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deletePkiSubscriber.isOpen}
        title={`Are you sure you want to remove the PKI subscriber: ${
          (popUp?.deletePkiSubscriber?.data as { name: string })?.name || ""
        }?`}
        onChange={(isOpen) => handlePopUpToggle("deletePkiSubscriber", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onRemoveSubscriberSubmit(
            (popUp?.deletePkiSubscriber?.data as { subscriberName: string })?.subscriberName
          )
        }
      />
    </div>
  );
};

export const PkiSubscriberDetailsByIDPage = () => {
  const { t } = useTranslation();
  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: "PKI Subscriber" })}</title>
      </Helmet>
      <ProjectPermissionCan
        I={ProjectPermissionPkiSubscriberActions.Read}
        a={ProjectPermissionSub.PkiSubscribers}
        passThrough={false}
        renderGuardBanner
      >
        <Page />
      </ProjectPermissionCan>
    </>
  );
};
