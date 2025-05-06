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
import {
  ProjectPermissionPkiSubscriberActions,
  ProjectPermissionSub,
  useWorkspace
} from "@app/context";
import { useDeletePkiSubscriber, useGetPkiSubscriberById } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/workspace/types";
import { usePopUp } from "@app/hooks/usePopUp";

import { PkiSubscriberModal } from "../PkiSubscribersPage/components/PkiSubscriberModal";
// import { PkiSubscriberCertificatesSection, PkiSubscriberDetailsSection } from "./components";

const Page = () => {
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const projectId = currentWorkspace?.id || "";
  const subscriberId = useParams({
    from: ROUTE_PATHS.CertManager.PkiSubscriberDetailsByIDPage.id,
    select: (el) => el.subscriberId
  });
  const { data } = useGetPkiSubscriberById(subscriberId);

  const { mutateAsync: deletePkiSubscriber } = useDeletePkiSubscriber();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "pkiSubscriber",
    "deletePkiSubscriber"
  ] as const);

  const onRemoveSubscriberSubmit = async (subscriberIdToDelete: string) => {
    try {
      if (!projectId) return;

      await deletePkiSubscriber({ subscriberId: subscriberIdToDelete });

      createNotification({
        text: "Successfully deleted PKI subscriber",
        type: "success"
      });

      handlePopUpClose("deletePkiSubscriber");
      navigate({
        to: `/${ProjectType.CertificateManager}/$projectId/subscribers` as const,
        params: {
          projectId
        }
      });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to delete PKI subscriber",
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
                  I={ProjectPermissionPkiSubscriberActions.Delete}
                  a={ProjectPermissionSub.PkiSubscribers}
                >
                  {(isAllowed) => (
                    <DropdownMenuItem
                      className={twMerge(
                        isAllowed
                          ? "hover:!bg-red-500 hover:!text-white"
                          : "pointer-events-none cursor-not-allowed opacity-50"
                      )}
                      onClick={() =>
                        handlePopUpOpen("deletePkiSubscriber", {
                          subscriberId: data.id,
                          name: data.name
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
              TODO: PkiSubscriberDetailsSection
              {/* <PkiSubscriberDetailsSection
                subscriberId={subscriberId}
                handlePopUpOpen={handlePopUpOpen}
              /> */}
            </div>
            <div className="w-full">
              TODO: PkiSubscriberCertificatesSection
              {/* <PkiSubscriberCertificatesSection subscriberId={subscriberId} /> */}
            </div>
          </div>
        </div>
      )}
      <PkiSubscriberModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <DeleteActionModal
        isOpen={popUp.deletePkiSubscriber.isOpen}
        title={`Are you sure want to remove the PKI subscriber: ${
          (popUp?.deletePkiSubscriber?.data as { name: string })?.name || ""
        }?`}
        onChange={(isOpen) => handlePopUpToggle("deletePkiSubscriber", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={() =>
          onRemoveSubscriberSubmit(
            (popUp?.deletePkiSubscriber?.data as { subscriberId: string })?.subscriberId
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
      {/* <ProjectPermissionCan
        I={ProjectPermissionPkiSubscriberActions.Read}
        a={ProjectPermissionSub.PkiSubscribers}
        passThrough={false}
        renderGuardBanner
      >
        <Page />
      </ProjectPermissionCan> */}
      TESTTT
    </>
  );
};

/**
 * import { createFileRoute } from "@tanstack/react-router";

import { PkiSubscriberDetailsByIDPage } from "./PkiSubscriberDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/cert-manager/$projectId/_cert-manager-layout/subscribers/$subscriberId"
)({
  component: PkiSubscriberDetailsByIDPage
});

 */
