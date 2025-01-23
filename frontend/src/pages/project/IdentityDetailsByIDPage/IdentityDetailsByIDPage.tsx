import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { subject } from "@casl/ability";
import { useNavigate, useParams } from "@tanstack/react-router";
import { formatRelative } from "date-fns";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { Button, DeleteActionModal, EmptyState, PageHeader, Spinner } from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { usePopUp } from "@app/hooks";
import {
  useDeleteIdentityFromWorkspace,
  useGetWorkspaceIdentityMembershipDetails
} from "@app/hooks/api";

import { IdentityProjectAdditionalPrivilegeSection } from "./components/IdentityProjectAdditionalPrivilegeSection";
import { IdentityRoleDetailsSection } from "./components/IdentityRoleDetailsSection";

const Page = () => {
  const navigate = useNavigate();
  const identityId = useParams({
    strict: false,
    select: (el) => el.identityId as string
  });
  const { currentWorkspace } = useWorkspace();

  const workspaceId = currentWorkspace?.id || "";

  const { data: identityMembershipDetails, isPending: isMembershipDetailsLoading } =
    useGetWorkspaceIdentityMembershipDetails(workspaceId, identityId);

  const { mutateAsync: deleteMutateAsync, isPending: isDeletingIdentity } =
    useDeleteIdentityFromWorkspace();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "deleteIdentity",
    "upgradePlan"
  ] as const);

  const onRemoveIdentitySubmit = async () => {
    try {
      await deleteMutateAsync({
        identityId,
        workspaceId
      });
      createNotification({
        text: "Successfully removed identity from project",
        type: "success"
      });
      handlePopUpClose("deleteIdentity");
      navigate({
        to: `/${currentWorkspace.type}/$projectId/access-management` as const,
        params: {
          projectId: workspaceId
        },
        search: {
          selectedTab: "identities"
        }
      });
    } catch (err) {
      console.error(err);
      const error = err as any;
      const text = error?.response?.data?.message ?? "Failed to remove identity from project";

      createNotification({
        text,
        type: "error"
      });
    }
  };

  if (isMembershipDetailsLoading) {
    return (
      <div className="flex w-full items-center justify-center p-24">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="container mx-auto flex max-w-7xl flex-col justify-between bg-bunker-800 text-white">
      {identityMembershipDetails ? (
        <>
          <PageHeader
            title={identityMembershipDetails?.identity?.name}
            description={`Identity joined on ${identityMembershipDetails?.createdAt && formatRelative(new Date(identityMembershipDetails?.createdAt || ""), new Date())}`}
          >
            <div>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Delete}
                a={subject(ProjectPermissionSub.Identity, {
                  identityId: identityMembershipDetails?.identity?.id
                })}
                renderTooltip
                allowedLabel="Remove from project"
              >
                {(isAllowed) => (
                  <Button
                    colorSchema="danger"
                    variant="outline_bg"
                    size="xs"
                    isDisabled={!isAllowed}
                    isLoading={isDeletingIdentity}
                    onClick={() => handlePopUpOpen("deleteIdentity")}
                  >
                    Remove Identity
                  </Button>
                )}
              </ProjectPermissionCan>
            </div>
          </PageHeader>
          <IdentityRoleDetailsSection
            identityMembershipDetails={identityMembershipDetails}
            isMembershipDetailsLoading={isMembershipDetailsLoading}
          />
          <IdentityProjectAdditionalPrivilegeSection
            identityMembershipDetails={identityMembershipDetails}
          />
          <DeleteActionModal
            isOpen={popUp.deleteIdentity.isOpen}
            title={`Are you sure want to remove ${identityMembershipDetails?.identity?.name} from the project?`}
            onChange={(isOpen) => handlePopUpToggle("deleteIdentity", isOpen)}
            deleteKey="remove"
            onDeleteApproved={() => onRemoveIdentitySubmit()}
          />
        </>
      ) : (
        <EmptyState title="Error: Unable to find the identity." className="py-12" />
      )}
    </div>
  );
};

export const IdentityDetailsByIDPage = () => {
  const { t } = useTranslation();

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.members.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <ProjectPermissionCan
        I={ProjectPermissionActions.Read}
        a={ProjectPermissionSub.Identity}
        passThrough={false}
        renderGuardBanner
      >
        <Page />
      </ProjectPermissionCan>
    </>
  );
};
