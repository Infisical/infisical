import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { subject } from "@casl/ability";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ChevronLeftIcon, EllipsisIcon, InfoIcon, ShieldIcon } from "lucide-react";

import { AssumePrivilegesDialog } from "@app/components/assume-privileges";
import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan, ProjectPermissionCan } from "@app/components/permissions";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  OrgIcon,
  PageHeader,
  PageLoader,
  SubOrgIcon,
  Tooltip,
  TooltipContent,
  TooltipTrigger
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
import { getProjectBaseURL } from "@app/helpers/project";
import { usePopUp } from "@app/hooks";
import {
  useDeleteProjectIdentityMembership,
  useGetProjectIdentityMembershipV2
} from "@app/hooks/api";
import { ActorType } from "@app/hooks/api/auditLogs/enums";
import { useRemovePamProductIdentityMember } from "@app/hooks/api/pam";
import { projectIdentityQuery, useDeleteProjectIdentity } from "@app/hooks/api/projectIdentity";
import { ProjectType } from "@app/hooks/api/projects/types";
import { FolderAccessSection } from "@app/pages/project/components/FolderAccessSection";
import { ProjectIdentityAuthenticationSection } from "@app/pages/project/IdentityDetailsByIDPage/components/ProjectIdentityAuthSection";
import { ProjectIdentityDetailsSection } from "@app/pages/project/IdentityDetailsByIDPage/components/ProjectIdentityDetailsSection";
import { ProjectAccessControlTabs } from "@app/types/project";

import { IdentityActionConfirmationDialog } from "./components/IdentityActionConfirmationDialog";
import { IdentityPermissionAuditSheet } from "./components/IdentityPermissionAuditSheet";
import { IdentityProjectAdditionalPrivilegeSection } from "./components/IdentityProjectAdditionalPrivilegeSection";
import { IdentityRoleDetailsSection } from "./components/IdentityRoleDetailsSection";
import { ProjectIdentityAlertAction } from "./components/ProjectIdentityAlertAction";

const Page = () => {
  const navigate = useNavigate();
  const identityId = useParams({
    strict: false,
    select: (el) => el.identityId as string
  });
  const { currentProject, projectId } = useProject();
  const { currentOrg, isSubOrganization } = useOrganization();

  const { data: identityMembershipDetails, isPending: isMembershipDetailsLoading } =
    useGetProjectIdentityMembershipV2(projectId, identityId, currentProject?.type);

  const { mutateAsync: removeIdentityMutateAsync } = useDeleteProjectIdentityMembership();
  const { mutateAsync: removePamIdentityMutateAsync } = useRemovePamProductIdentityMember();

  const isProjectIdentity = Boolean(identityMembershipDetails?.identity.projectId);
  const isCertManager = currentProject?.type === ProjectType.CertificateManager;
  const isPam = currentProject?.type === ProjectType.PAM;
  // Products where the underlying project is an internal detail the user never sees
  const isStandaloneProduct = isCertManager || isPam;

  let removeMenuItemLabel = "Remove From Project";
  if (isProjectIdentity) {
    removeMenuItemLabel = "Delete Machine Identity";
  } else if (isPam) {
    removeMenuItemLabel = "Remove From PAM";
  }

  let accessControlLabel = "project";
  if (isCertManager) {
    accessControlLabel = "certificate manager";
  } else if (isPam) {
    accessControlLabel = "PAM";
  }
  const pageDescription = `Configure and manage${
    isProjectIdentity ? " machine identity and " : " "
  }${accessControlLabel} access control`;

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
  const [isPermissionAuditOpen, setIsPermissionAuditOpen] = useState(false);

  const onRemoveIdentitySubmit = async () => {
    if (isPam) {
      // PAM removal goes through the PAM endpoint so PAM audit events fire and
      // folder/account resource memberships are cleaned up (the generic route skips that)
      await removePamIdentityMutateAsync({
        identityId,
        projectId
      });
    } else {
      await removeIdentityMutateAsync({
        identityId,
        projectId
      });
    }
    createNotification({
      text: `Successfully removed machine identity from ${isPam ? "PAM" : "project"}`,
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
    return <PageLoader />;
  }

  const isOrgIdentity = !isProjectIdentity;
  const isSubOrgIdentity =
    isOrgIdentity &&
    isSubOrganization &&
    currentOrg.rootOrgId !== identityMembershipDetails?.identity.orgId;

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
            className="mb-4 flex w-fit items-center gap-x-1 text-sm text-muted transition duration-100 hover:text-foreground"
          >
            <ChevronLeftIcon size={16} />
            {isStandaloneProduct ? "Machine Identities" : "Project Machine Identities"}
          </Link>
          <PageHeader
            scope={currentProject.type}
            description={pageDescription}
            title={identityMembershipDetails.identity.name}
          >
            <div className="flex items-center gap-2">
              {isProjectIdentity ? (
                <ProjectIdentityAlertAction
                  identityId={identityMembershipDetails.identity.id}
                  identityName={identityMembershipDetails.identity.name}
                  projectId={currentProject.id}
                  projectName={currentProject.name}
                />
              ) : (
                <ProjectIdentityAlertAction
                  identityId={identityMembershipDetails.identity.id}
                  identityName={identityMembershipDetails.identity.name}
                  readOnly
                />
              )}
              {!isStandaloneProduct && (
                <Button variant="outline" onClick={() => setIsPermissionAuditOpen(true)}>
                  <ShieldIcon />
                  Permission Audit
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    Options
                    <EllipsisIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      navigator.clipboard.writeText(identityMembershipDetails.identity.id);
                      createNotification({
                        text: "Machine identity ID copied to clipboard",
                        type: "info"
                      });
                    }}
                  >
                    Copy Machine Identity ID
                  </DropdownMenuItem>
                  <ProjectPermissionCan
                    I={ProjectPermissionIdentityActions.AssumePrivileges}
                    a={subject(ProjectPermissionSub.Identity, {
                      identityId: identityMembershipDetails?.identity.id
                    })}
                  >
                    {(isAllowed) => (
                      <Tooltip>
                        <TooltipTrigger className="block w-full">
                          <DropdownMenuItem
                            isDisabled={!isAllowed}
                            onClick={() => handlePopUpOpen("assumePrivileges")}
                          >
                            Assume Privileges
                            {isAllowed && <InfoIcon className="text-muted" />}
                          </DropdownMenuItem>
                        </TooltipTrigger>
                        {isAllowed && (
                          <TooltipContent className="max-w-80" side="left">
                            Assume the privileges of this machine identity, allowing you to
                            replicate their access behavior.
                          </TooltipContent>
                        )}
                      </Tooltip>
                    )}
                  </ProjectPermissionCan>
                  <ProjectPermissionCan
                    I={ProjectPermissionActions.Delete}
                    a={subject(ProjectPermissionSub.Identity, {
                      identityId: identityMembershipDetails?.identity?.id
                    })}
                  >
                    {(isAllowed) => (
                      <DropdownMenuItem
                        variant="danger"
                        isDisabled={!isAllowed}
                        onClick={() =>
                          isProjectIdentity
                            ? handlePopUpOpen("deleteIdentity")
                            : handlePopUpOpen("removeIdentity")
                        }
                      >
                        {removeMenuItemLabel}
                      </DropdownMenuItem>
                    )}
                  </ProjectPermissionCan>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </PageHeader>
          <div className="flex flex-col gap-5 lg:flex-row">
            <ProjectIdentityDetailsSection
              identity={identity || { ...identityMembershipDetails?.identity, projectId: "" }}
              isOrgIdentity={isOrgIdentity}
              isSubOrgIdentity={isSubOrgIdentity}
              membership={identityMembershipDetails!}
            />

            <div className="flex flex-1 flex-col gap-y-5">
              {identity ? (
                <ProjectIdentityAuthenticationSection
                  identity={identity}
                  refetchIdentity={() => refetchIdentity()}
                />
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Authentication</CardTitle>
                    <CardDescription>Configure authentication methods</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Alert variant={isSubOrgIdentity ? "sub-org" : "org"}>
                      {isSubOrgIdentity ? <SubOrgIcon /> : <OrgIcon />}
                      <AlertTitle>
                        Machine identity managed by {isSubOrgIdentity ? "sub-" : ""}organization
                      </AlertTitle>
                      <AlertDescription>
                        <p>
                          This machine identity&apos;s authentication methods are managed by your{" "}
                          {isSubOrgIdentity ? "sub-" : ""}organization
                          <OrgPermissionCan
                            I={OrgPermissionIdentityActions.Read}
                            an={OrgPermissionSubjects.Identity}
                          >
                            {(isAllowed) =>
                              isAllowed ? (
                                <>
                                  <span>
                                    <br /> To make changes,{" "}
                                  </span>
                                  <Link
                                    to="/organizations/$orgId/identities/$identityId"
                                    className="inline-block cursor-pointer text-foreground underline underline-offset-2"
                                    params={{
                                      identityId,
                                      orgId: identityMembershipDetails.identity.orgId
                                    }}
                                  >
                                    go to {isSubOrgIdentity ? "sub-" : ""}organization access
                                    control
                                  </Link>
                                </>
                              ) : null
                            }
                          </OrgPermissionCan>
                          .
                        </p>
                      </AlertDescription>
                    </Alert>
                  </CardContent>
                </Card>
              )}
              <IdentityRoleDetailsSection
                identityMembershipDetails={identityMembershipDetails}
                isMembershipDetailsLoading={isMembershipDetailsLoading}
              />
              {!isStandaloneProduct && currentProject.isLegacyAdditionalPrivilegesEnabled && (
                <IdentityProjectAdditionalPrivilegeSection
                  identityMembershipDetails={identityMembershipDetails}
                />
              )}
              {currentProject.type === ProjectType.SecretManager && (
                <FolderAccessSection
                  actor={{
                    type: "identity",
                    id: identityMembershipDetails.identity.id,
                    name: identityMembershipDetails.identity.name
                  }}
                />
              )}
            </div>
          </div>
          <IdentityActionConfirmationDialog
            open={popUp.removeIdentity.isOpen}
            title={`Remove ${identityMembershipDetails.identity.name} from ${isPam ? "PAM" : "the project"}?`}
            description={`The machine identity will lose access to ${isPam ? "PAM" : "this project"} but remain available in its organization.`}
            descriptionAsAlert
            confirmationText="remove"
            actionLabel="Remove"
            onOpenChange={(isOpen) => handlePopUpToggle("removeIdentity", isOpen)}
            onConfirm={onRemoveIdentitySubmit}
          />
          <AssumePrivilegesDialog
            isOpen={popUp.assumePrivileges.isOpen}
            onOpenChange={(isOpen) => handlePopUpToggle("assumePrivileges", isOpen)}
            actorType={ActorType.IDENTITY}
            actorId={identityId}
          />
          <IdentityActionConfirmationDialog
            open={popUp.deleteIdentity.isOpen}
            title={`Delete ${identity?.name || "machine identity"}?`}
            description="This permanently deletes the project machine identity and revokes its access. This cannot be undone."
            descriptionAsAlert
            descriptionAlertVariant="danger"
            confirmationText="confirm"
            actionLabel="Delete"
            onOpenChange={(isOpen) => handlePopUpToggle("deleteIdentity", isOpen)}
            onConfirm={handleDeleteIdentity}
          />
          {isPermissionAuditOpen && (
            <IdentityPermissionAuditSheet
              open={isPermissionAuditOpen}
              onOpenChange={setIsPermissionAuditOpen}
              identityId={identityId}
              targetName={identityMembershipDetails.identity.name}
            />
          )}
        </>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Machine identity not found</EmptyTitle>
            <EmptyDescription>
              The machine identity may have been removed or you may not have access to it.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
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
