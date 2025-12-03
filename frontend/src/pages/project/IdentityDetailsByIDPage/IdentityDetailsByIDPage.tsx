import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { subject } from "@casl/ability";
import { DropdownMenu } from "@radix-ui/react-dropdown-menu";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronLeftIcon, EllipsisIcon, InfoIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan, ProjectPermissionCan } from "@app/components/permissions";
import {
  ConfirmActionModal,
  DeleteActionModal,
  EmptyState,
  PageHeader,
  Tooltip
} from "@app/components/v2";
import {
  OrgIcon,
  UnstableAlert,
  UnstableAlertDescription,
  UnstableAlertTitle,
  UnstableButton,
  UnstableCard,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstablePageLoader
} from "@app/components/v3";
import {
  OrgPermissionIdentityActions,
  OrgPermissionSubjects,
  ProjectPermissionActions,
  ProjectPermissionIdentityActions,
  ProjectPermissionSub,
  useOrganization,
  useProject
} from "@app/context";
import { getProjectBaseURL, getProjectHomePage } from "@app/helpers/project";
import { usePopUp } from "@app/hooks";
import {
  useAssumeProjectPrivileges,
  useDeleteProjectIdentityMembership,
  useGetProjectIdentityMembershipV2
} from "@app/hooks/api";
import { ActorType } from "@app/hooks/api/auditLogs/enums";
import { projectIdentityQuery, useDeleteProjectIdentity } from "@app/hooks/api/projectIdentity";
import { ProjectIdentityAuthenticationSection } from "@app/pages/project/IdentityDetailsByIDPage/components/ProjectIdentityAuthSection";
import { ProjectIdentityDetailsSection } from "@app/pages/project/IdentityDetailsByIDPage/components/ProjectIdentityDetailsSection";
import { ProjectAccessControlTabs } from "@app/types/project";

import { IdentityProjectAdditionalPrivilegeSection } from "./components/IdentityProjectAdditionalPrivilegeSection";
import { IdentityRoleDetailsSection } from "./components/IdentityRoleDetailsSection";

const Page = () => {
  const navigate = useNavigate();
  const identityId = useParams({
    strict: false,
    select: (el) => el.identityId as string
  });
  const { currentProject, projectId } = useProject();
  const { currentOrg, isSubOrganization } = useOrganization();

  const { data: identityMembershipDetails, isPending: isMembershipDetailsLoading } =
    useGetProjectIdentityMembershipV2(projectId, identityId);

  const { mutateAsync: removeIdentityMutateAsync } = useDeleteProjectIdentityMembership();

  const isProjectIdentity = Boolean(identityMembershipDetails?.identity.projectId);
  const isNonScopedIdentity =
    !isProjectIdentity && currentOrg.id !== identityMembershipDetails?.identity?.orgId;

  const {
    data: identity,
    isPending: isProjectIdentityPending,
    refetch: refetchIdentity
  } = useQuery({
    ...projectIdentityQuery.getById({
      identityId: identityMembershipDetails?.identity.id as string,
      projectId: identityMembershipDetails?.identity.projectId as string
    }),
    enabled: isProjectIdentity
  });

  const { mutateAsync: deleteIdentity } = useDeleteProjectIdentity();

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
    "removeIdentity",
    "deleteIdentity",
    "assumePrivileges"
  ] as const);
  const assumePrivileges = useAssumeProjectPrivileges();

  const handleAssumePrivileges = async () => {
    assumePrivileges.mutate(
      {
        actorId: identityId,
        actorType: ActorType.IDENTITY,
        projectId
      },
      {
        onSuccess: () => {
          createNotification({
            type: "success",
            text: "Machine identity privilege assumption has started"
          });
          const url = `${getProjectHomePage(currentProject.type, currentProject.environments)}${isSubOrganization && isNonScopedIdentity ? `?subOrganization=${currentOrg.slug}` : ""}`;
          window.location.assign(
            url.replace("$orgId", currentOrg.id).replace("$projectId", currentProject.id)
          );
        }
      }
    );
  };

  const onRemoveIdentitySubmit = async () => {
    await removeIdentityMutateAsync({
      identityId,
      projectId
    });
    createNotification({
      text: "Successfully removed machine identity from project",
      type: "success"
    });
    handlePopUpClose("removeIdentity");
    navigate({
      to: `${getProjectBaseURL(currentProject.type)}/access-management` as const,
      params: {
        projectId,
        orgId: currentOrg.id
      },
      search: {
        selectedTab: "identities"
      }
    });
  };

  const handleDeleteIdentity = async () => {
    if (!identity) return;

    try {
      await deleteIdentity({
        identityId: identity.id,
        projectId: identity.projectId!
      });

      navigate({
        to: `${getProjectBaseURL(currentProject.type)}/access-management`,
        search: {
          selectedTab: "identities"
        }
      });
    } catch {
      createNotification({
        type: "error",
        text: "Failed to delete project machine identity"
      });
    }
  };

  if (isMembershipDetailsLoading || (isProjectIdentity && isProjectIdentityPending)) {
    return <UnstablePageLoader />;
  }

  return (
    <div className="mx-auto flex max-w-8xl flex-col">
      {identityMembershipDetails ? (
        <>
          <Link
            to={`${getProjectBaseURL(currentProject.type)}/access-management`}
            params={{
              projectId,
              orgId: currentOrg.id
            }}
            search={{
              selectedTab: ProjectAccessControlTabs.Identities
            }}
            className="mb-3 flex w-fit items-center gap-x-1 text-sm text-mineshaft-400 transition duration-100 hover:text-mineshaft-400/80"
          >
            <ChevronLeftIcon size={16} />
            Project Machine Identities
          </Link>
          <PageHeader
            scope={currentProject.type}
            className="mb-20"
            description={`Configure and manage${isProjectIdentity ? " machine identity and " : " "}project access control`}
            title={identityMembershipDetails.identity.name}
          >
            <DropdownMenu>
              <UnstableDropdownMenuTrigger asChild>
                <UnstableButton variant="outline">
                  Options
                  <EllipsisIcon />
                </UnstableButton>
              </UnstableDropdownMenuTrigger>
              <UnstableDropdownMenuContent align="end">
                <UnstableDropdownMenuItem
                  onClick={() => {
                    navigator.clipboard.writeText(identityMembershipDetails.id);
                    createNotification({
                      text: "Machine identity ID copied to clipboard",
                      type: "info"
                    });
                  }}
                >
                  Copy Machine Identity ID
                </UnstableDropdownMenuItem>
                <ProjectPermissionCan
                  I={ProjectPermissionIdentityActions.AssumePrivileges}
                  a={subject(ProjectPermissionSub.Identity, {
                    identityId: identityMembershipDetails?.identity.id
                  })}
                  passThrough={false}
                >
                  {(isAllowed) => (
                    <UnstableDropdownMenuItem
                      isDisabled={!isAllowed}
                      onClick={() => handlePopUpOpen("assumePrivileges")}
                    >
                      Assume Privileges
                      <Tooltip
                        side="bottom"
                        content="Assume the privileges of the machine identity, allowing you to replicate their access behavior."
                      >
                        <div>
                          <InfoIcon className="text-muted" />
                        </div>
                      </Tooltip>
                    </UnstableDropdownMenuItem>
                  )}
                </ProjectPermissionCan>
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Delete}
                  a={subject(ProjectPermissionSub.Identity, {
                    identityId: identityMembershipDetails?.identity?.id
                  })}
                >
                  {(isAllowed) => (
                    <UnstableDropdownMenuItem
                      variant="danger"
                      isDisabled={!isAllowed}
                      onClick={() =>
                        isProjectIdentity
                          ? handlePopUpOpen("deleteIdentity")
                          : handlePopUpOpen("removeIdentity")
                      }
                    >
                      {isProjectIdentity ? "Delete Machine Identity" : "Remove From Project"}
                    </UnstableDropdownMenuItem>
                  )}
                </ProjectPermissionCan>
              </UnstableDropdownMenuContent>
            </DropdownMenu>
          </PageHeader>
          <div className="flex flex-col gap-20 lg:flex-row">
            <ProjectIdentityDetailsSection
              identity={identity || { ...identityMembershipDetails?.identity, projectId: "" }}
              isOrgIdentity={!isProjectIdentity}
              membership={identityMembershipDetails!}
            />

            <div className="flex flex-1 flex-col gap-y-20">
              {identity ? (
                <ProjectIdentityAuthenticationSection
                  identity={identity}
                  refetchIdentity={() => refetchIdentity()}
                />
              ) : (
                <UnstableCard>
                  <UnstableCardHeader className="border-b">
                    <UnstableCardTitle>Authentication</UnstableCardTitle>
                    <UnstableCardDescription>
                      Configure authentication methods
                    </UnstableCardDescription>
                  </UnstableCardHeader>
                  <UnstableCardContent>
                    <UnstableAlert variant="org">
                      <OrgIcon />
                      <UnstableAlertTitle>
                        Machine identity managed by organization
                      </UnstableAlertTitle>
                      <UnstableAlertDescription>
                        <p>
                          This machine identity&apos;s authentication methods are controlled by your
                          organization. To make changes,{" "}
                          <OrgPermissionCan
                            I={OrgPermissionIdentityActions.Read}
                            an={OrgPermissionSubjects.Identity}
                          >
                            {(isAllowed) =>
                              isAllowed ? (
                                <Link
                                  to="/organizations/$orgId/identities/$identityId"
                                  className="inline-block cursor-pointer text-foreground underline underline-offset-2"
                                  params={{
                                    identityId,
                                    orgId: currentOrg.id
                                  }}
                                >
                                  go to organization access control
                                </Link>
                              ) : null
                            }
                          </OrgPermissionCan>
                          .
                        </p>
                      </UnstableAlertDescription>
                    </UnstableAlert>
                  </UnstableCardContent>
                </UnstableCard>
              )}
              <IdentityRoleDetailsSection
                identityMembershipDetails={identityMembershipDetails}
                isMembershipDetailsLoading={isMembershipDetailsLoading}
              />
              <IdentityProjectAdditionalPrivilegeSection
                identityMembershipDetails={identityMembershipDetails}
              />
            </div>
          </div>
          <DeleteActionModal
            isOpen={popUp.removeIdentity.isOpen}
            title={`Are you sure you want to remove ${identityMembershipDetails?.identity?.name} from the project?`}
            onChange={(isOpen) => handlePopUpToggle("removeIdentity", isOpen)}
            deleteKey="remove"
            onDeleteApproved={() => onRemoveIdentitySubmit()}
          />
          <ConfirmActionModal
            isOpen={popUp.assumePrivileges.isOpen}
            confirmKey="assume"
            title="Do you want to assume privileges of this machine identity?"
            subTitle="This will set your privileges to those of the machine identity for the next hour."
            onChange={(isOpen) => handlePopUpToggle("assumePrivileges", isOpen)}
            onConfirmed={handleAssumePrivileges}
            buttonText="Confirm"
          />
          <DeleteActionModal
            isOpen={popUp.deleteIdentity.isOpen}
            title={`Are you sure you want to delete ${identity?.name}?`}
            onChange={(isOpen) => handlePopUpToggle("deleteIdentity", isOpen)}
            deleteKey="confirm"
            onDeleteApproved={handleDeleteIdentity}
          />
        </>
      ) : (
        <EmptyState title="Error: Unable to find the machine identity." className="py-12" />
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
