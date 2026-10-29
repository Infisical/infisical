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
import { LegacyPkiResource } from "@app/const/legacyPkiDeprecation";
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

import { LegacyPkiDeprecationAlert } from "../components/LegacyPkiDeprecationAlert";
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
      to: "/organizations/$orgId/cert-manager/subscribers",
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
                to="/organizations/$orgId/cert-manager/subscribers"
                params={{
                  orgId: currentOrg.id
                }}
              >
                <FontAwesomeIcon icon={faChevronLeft} />
                Subscribers
              </Link>
            }
            scope={ProjectType.CertificateManager}
            title={data.name}
            description="Manage PKI subscriber"
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">More</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <ProjectPermissionCan
                  I={ProjectPermissionPkiSubscriberActions.Delete}
                  a={ProjectPermissionSub.PkiSubscribers}
                >
                  {(isAllowed) => (
                    <DropdownMenuItem
                      onClick={() =>
                        handlePopUpOpen("deletePkiSubscriber", {
                          subscriberName: data.name
                        })
                      }
                      isDisabled={!isAllowed}
                      variant="danger"
                    >
                      Delete PKI Subscriber
                    </DropdownMenuItem>
                  )}
                </ProjectPermissionCan>
              </DropdownMenuContent>
            </DropdownMenu>
          </PageHeader>
          <div className="flex flex-col gap-8">
            <LegacyPkiDeprecationAlert resource={LegacyPkiResource.PkiSubscriber} />
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
        </div>
      )}
      <PkiSubscriberModal popUp={popUp} handlePopUpToggle={handlePopUpToggle} />
      <ConfirmationAlertDialog
        isOpen={popUp.deletePkiSubscriber.isOpen}
        description="This action is irreversible."
        title={`Are you sure you want to remove the PKI subscriber: ${
          (popUp?.deletePkiSubscriber?.data as { name: string })?.name || ""
        }?`}
        onOpenChange={(isOpen) => handlePopUpToggle("deletePkiSubscriber", isOpen)}
        confirmKey="confirm"
        onConfirm={() =>
          onRemoveSubscriberSubmit(
            (popUp?.deletePkiSubscriber?.data as { subscriberName: string })?.subscriberName
          )
        }
      />
    </div>
  );
};

export const PkiSubscriberDetailsByIDPage = () => {
  return (
    <>
      <PageTitle title="PKI Subscriber" />
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
