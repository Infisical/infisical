import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { subject } from "@casl/ability";
import { faChevronLeft } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { formatRelative } from "date-fns";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan, ProjectPermissionCan } from "@app/components/permissions";
import {
  Alert,
  AlertDescription,
  Button,
  ConfirmActionModal,
  DeleteActionModal,
  EmptyState,
  PageHeader,
  Spinner
} from "@app/components/v2";
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
import { projectIdentityQuery } from "@app/hooks/api/projectIdentity";
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
  const { currentOrg } = useOrganization();

  const { data: identityMembershipDetails, isPending: isMembershipDetailsLoading } =
    useGetProjectIdentityMembershipV2(projectId, identityId);

  const { mutateAsync: deleteMutateAsync, isPending: isDeletingIdentity } =
    useDeleteProjectIdentityMembership();

  const isProjectIdentity = Boolean(identityMembershipDetails?.identity.projectId);

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

  const { popUp, handlePopUpOpen, handlePopUpClose, handlePopUpToggle } = usePopUp([
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
          const url = getProjectHomePage(currentProject.type, currentProject.environments);
          window.location.assign(
            url.replace("$orgId", currentOrg.id).replace("$projectId", currentProject.id)
          );
        }
      }
    );
  };

  const onRemoveIdentitySubmit = async () => {
    await deleteMutateAsync({
      identityId,
      projectId
    });
    createNotification({
      text: "Successfully removed machine identity from project",
      type: "success"
    });
    handlePopUpClose("deleteIdentity");
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

  if (isMembershipDetailsLoading || (isProjectIdentity && isProjectIdentityPending)) {
    return (
      <div className="flex w-full items-center justify-center p-24">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-8xl flex-col justify-between bg-bunker-800 text-white">
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
            className="mb-4 flex items-center gap-x-2 text-sm text-mineshaft-400"
          >
            <FontAwesomeIcon icon={faChevronLeft} />
            Project Machine Identities
          </Link>
          <PageHeader
            scope={currentProject.type}
            title={identityMembershipDetails?.identity?.name}
            description={`Machine identity ${isProjectIdentity ? "created" : "added"} on ${identityMembershipDetails?.createdAt && formatRelative(new Date(identityMembershipDetails?.createdAt || ""), new Date())}`}
            className={!isProjectIdentity ? "mb-4" : undefined}
          >
            <div className="flex items-center gap-2">
              <Button
                variant="outline_bg"
                size="xs"
                onClick={() => {
                  navigator.clipboard.writeText(identityMembershipDetails.id);
                  createNotification({
                    text: "Membership ID copied to clipboard",
                    type: "success"
                  });
                }}
              >
                Copy Membership ID
              </Button>
              <ProjectPermissionCan
                I={ProjectPermissionIdentityActions.AssumePrivileges}
                a={subject(ProjectPermissionSub.Identity, {
                  identityId: identityMembershipDetails?.identity.id
                })}
                renderTooltip
                allowedLabel="Assume privileges of the machine identity"
                passThrough={false}
              >
                {(isAllowed) => (
                  <Button
                    variant="outline_bg"
                    size="xs"
                    isDisabled={!isAllowed}
                    onClick={() => handlePopUpOpen("assumePrivileges")}
                  >
                    Assume Privileges
                  </Button>
                )}
              </ProjectPermissionCan>
              {!isProjectIdentity && (
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
                      Remove Machine Identity
                    </Button>
                  )}
                </ProjectPermissionCan>
              )}
            </div>
          </PageHeader>
          {!isProjectIdentity && (
            <Alert hideTitle iconClassName="text-info" className="mb-4 border-info/50 bg-info/10">
              <AlertDescription>
                This machine identity is managed by your organization.{" "}
                <OrgPermissionCan
                  I={OrgPermissionIdentityActions.Read}
                  an={OrgPermissionSubjects.Identity}
                >
                  {(isAllowed) =>
                    isAllowed ? (
                      <Link
                        to="/organizations/$orgId/identities/$identityId"
                        params={{
                          identityId,
                          orgId: currentOrg.id
                        }}
                      >
                        <span className="cursor-pointer text-info underline underline-offset-2">
                          Click here to manage machine identity.
                        </span>
                      </Link>
                    ) : null
                  }
                </OrgPermissionCan>
              </AlertDescription>
            </Alert>
          )}
          <div className="flex gap-x-4">
            {identity ? (
              <div className="flex w-72 flex-col gap-y-4">
                <ProjectIdentityDetailsSection
                  identity={identity}
                  membership={identityMembershipDetails!}
                />
                <ProjectIdentityAuthenticationSection
                  identity={identity}
                  refetchIdentity={() => refetchIdentity()}
                />
              </div>
            ) : (
              <div>
                <div className="flex w-72 flex-col gap-y-4">
                  <ProjectIdentityDetailsSection
                    identity={{ ...identityMembershipDetails?.identity, projectId: "" }}
                    isOrgIdentity
                    membership={identityMembershipDetails!}
                  />
                </div>
              </div>
            )}
            <div className="flex-1">
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
            isOpen={popUp.deleteIdentity.isOpen}
            title={`Are you sure you want to remove ${identityMembershipDetails?.identity?.name} from the project?`}
            onChange={(isOpen) => handlePopUpToggle("deleteIdentity", isOpen)}
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
