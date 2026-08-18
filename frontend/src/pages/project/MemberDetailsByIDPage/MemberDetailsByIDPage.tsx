import { useState } from "react";
import { Helmet } from "react-helmet";
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import {
  ChevronLeftIcon,
  CircleAlertIcon,
  EllipsisIcon,
  InfoIcon,
  RefreshCwIcon,
  ShieldIcon
} from "lucide-react";

import { AssumePrivilegesModal } from "@app/components/assume-privileges";
import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogConfirmationField,
  AlertDialogConfirmationLabel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertTitle,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Field,
  Input,
  PageHeader,
  PageLoader,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  useOrganization,
  useProject,
  useUser
} from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import { usePopUp } from "@app/hooks";
import { useDeleteUserFromWorkspace, useGetWorkspaceUserDetails } from "@app/hooks/api";
import { ActorType } from "@app/hooks/api/auditLogs/enums";
import { ProjectType } from "@app/hooks/api/projects/types";
import { ProjectAccessControlTabs } from "@app/types/project";

import { MemberPermissionAuditSheet } from "./components/MemberPermissionAuditSheet";
import { MemberProjectAdditionalPrivilegeSection } from "./components/MemberProjectAdditionalPrivilegeSection";
import { MemberRoleDetailsSection } from "./components/MemberRoleDetailsSection";
import { ProjectMemberDetailsSection } from "./components/ProjectMemberDetailsSection";

export const Page = () => {
  const navigate = useNavigate();
  const membershipId = useParams({
    strict: false,
    select: (el) => el.membershipId as string
  });
  const { currentOrg } = useOrganization();
  const { currentProject, projectId } = useProject();
  const {
    user: { id: currentUserId }
  } = useUser();

  const {
    data: membershipDetails,
    isPending: isMembershipDetailsLoading,
    isError: isMembershipDetailsError,
    refetch: refetchMembershipDetails
  } = useGetWorkspaceUserDetails(projectId, membershipId, currentProject?.type);

  const removeUserMutation = useDeleteUserFromWorkspace();

  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "removeMember",
    "upgradePlan",
    "assumePrivileges"
  ] as const);

  const [isPermissionAuditOpen, setIsPermissionAuditOpen] = useState(false);
  const [removeConfirmation, setRemoveConfirmation] = useState("");

  const handleRemoveUser = async () => {
    if (!currentOrg?.id || !currentProject?.id || !membershipDetails?.user?.username) return;

    await removeUserMutation.mutateAsync({
      projectId,
      projectType: currentProject?.type,
      usernames: [membershipDetails?.user?.username],
      orgId: currentOrg.id
    });
    createNotification({
      text: "Successfully removed user from project",
      type: "success"
    });
    setRemoveConfirmation("");
    navigate({
      to: `${getProjectBaseURL(currentProject.type)}/access-management` as const,
      params: {
        projectId: currentProject.id,
        orgId: currentOrg.id
      }
    });
    handlePopUpClose("removeMember");
  };

  if (isMembershipDetailsLoading) {
    return (
      <div className="h-96 w-full">
        <PageLoader />
      </div>
    );
  }

  if (isMembershipDetailsError) {
    return (
      <div className="mx-auto flex max-w-8xl flex-col">
        <Alert variant="danger">
          <CircleAlertIcon />
          <AlertTitle>Could not load user membership</AlertTitle>
          <AlertDescription>
            <span>Retry to load this user and their access details.</span>
            <Button
              size="xs"
              variant="danger"
              onClick={() => refetchMembershipDetails().catch(() => undefined)}
            >
              <RefreshCwIcon />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const isOwnProjectMembershipDetails = currentUserId === membershipDetails?.user?.id;
  const isCertManager = currentProject?.type === ProjectType.CertificateManager;
  let memberDisplayName = "Unnamed User";
  if (membershipDetails) {
    const { firstName, lastName, email, username } = membershipDetails.user;
    memberDisplayName =
      firstName || lastName
        ? `${firstName ?? ""} ${lastName ?? ""}`.trim()
        : email || username || membershipDetails.inviteEmail || "Unnamed User";
  }

  return (
    <div className="mx-auto flex max-w-8xl flex-col">
      {membershipDetails ? (
        <>
          <Link
            to={`${getProjectBaseURL(currentProject.type)}/access-management`}
            params={{
              projectId: currentProject.id,
              orgId: currentOrg.id
            }}
            search={{
              selectedTab: ProjectAccessControlTabs.Member
            }}
            className="mb-4 flex w-fit items-center gap-x-1 text-sm text-muted transition-colors hover:text-foreground"
          >
            <ChevronLeftIcon className="size-4" />
            {isCertManager ? "Users" : "Project Users"}
          </Link>
          <PageHeader
            scope={currentProject.type}
            title={memberDisplayName}
            description={
              isCertManager
                ? "Configure and manage certificate manager access control"
                : "Configure and manage project access control"
            }
          >
            <div className="flex items-center gap-2">
              {!isCertManager && (
                <Button variant="outline" onClick={() => setIsPermissionAuditOpen(true)}>
                  <ShieldIcon />
                  Permission Audit
                </Button>
              )}
              {isOwnProjectMembershipDetails ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="info" className="ml-2">
                      <InfoIcon /> {isCertManager ? "Your membership" : "Your project membership"}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {isCertManager
                      ? "You cannot modify your own membership. Ask a Certificate Manager admin to make changes to your membership."
                      : "You cannot modify your own membership. Ask a project admin to make changes to your membership."}
                  </TooltipContent>
                </Tooltip>
              ) : (
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
                        navigator.clipboard.writeText(membershipDetails.user.id);
                        createNotification({
                          text: "User ID copied to clipboard",
                          type: "info"
                        });
                      }}
                    >
                      Copy User ID
                    </DropdownMenuItem>
                    {!isCertManager && (
                      <ProjectPermissionCan
                        I={ProjectPermissionMemberActions.AssumePrivileges}
                        a={ProjectPermissionSub.Member}
                      >
                        {(isAllowed) => (
                          <Tooltip>
                            <TooltipTrigger className="block w-full">
                              <DropdownMenuItem
                                isDisabled={!isAllowed}
                                onClick={() =>
                                  handlePopUpOpen("assumePrivileges", {
                                    userId: membershipDetails.user.id
                                  })
                                }
                              >
                                Assume Privileges
                                {isAllowed && <InfoIcon className="text-muted" />}
                              </DropdownMenuItem>
                            </TooltipTrigger>
                            {isAllowed && (
                              <TooltipContent className="max-w-80" side="left">
                                Assume the privileges of this user, allowing you to replicate their
                                access behavior.
                              </TooltipContent>
                            )}
                          </Tooltip>
                        )}
                      </ProjectPermissionCan>
                    )}
                    <ProjectPermissionCan
                      I={ProjectPermissionMemberActions.Delete}
                      a={ProjectPermissionSub.Member}
                    >
                      {(isAllowed) => (
                        <DropdownMenuItem
                          variant="danger"
                          isDisabled={!isAllowed}
                          onClick={() => handlePopUpOpen("removeMember")}
                        >
                          {isCertManager
                            ? "Remove User From Certificate Manager"
                            : "Remove User From Project"}
                        </DropdownMenuItem>
                      )}
                    </ProjectPermissionCan>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </PageHeader>
          <div className="flex flex-col gap-5 lg:flex-row">
            <ProjectMemberDetailsSection membership={membershipDetails} />
            <div className="flex flex-1 flex-col gap-y-5">
              <MemberRoleDetailsSection
                membershipDetails={membershipDetails}
                isMembershipDetailsLoading={isMembershipDetailsLoading}
                onOpenUpgradeModal={() =>
                  handlePopUpOpen("upgradePlan", {
                    text: "Assigning custom roles to members can be unlocked if you upgrade to Infisical Enterprise plan.",
                    isEnterpriseFeature: true
                  })
                }
              />
              {!isCertManager && (
                <MemberProjectAdditionalPrivilegeSection membershipDetails={membershipDetails} />
              )}
            </div>
          </div>
          <AlertDialog
            open={popUp.removeMember.isOpen}
            onOpenChange={(isOpen) => {
              if (removeUserMutation.isPending) return;
              if (!isOpen) setRemoveConfirmation("");
              handlePopUpToggle("removeMember", isOpen);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Remove {memberDisplayName} from the{" "}
                  {isCertManager ? "certificate manager" : "project"}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This user will lose access granted by this membership. This cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogConfirmationField>
                <Field>
                  <AlertDialogConfirmationLabel
                    htmlFor="remove-member-detail-confirmation"
                    confirmationValue="remove"
                  />
                  <Input
                    id="remove-member-detail-confirmation"
                    value={removeConfirmation}
                    onChange={(event) => setRemoveConfirmation(event.target.value)}
                    placeholder="remove"
                    autoComplete="off"
                    autoFocus
                    disabled={removeUserMutation.isPending}
                  />
                </Field>
              </AlertDialogConfirmationField>
              <AlertDialogFooter>
                <AlertDialogCancel variant="outline" isDisabled={removeUserMutation.isPending}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  variant="danger"
                  isPending={removeUserMutation.isPending}
                  isDisabled={removeConfirmation !== "remove"}
                  onClick={(event) => {
                    event.preventDefault();
                    handleRemoveUser().catch(() => undefined);
                  }}
                >
                  Remove User
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AssumePrivilegesModal
            isOpen={popUp.assumePrivileges.isOpen}
            onOpenChange={(isOpen) => handlePopUpToggle("assumePrivileges", isOpen)}
            actorType={ActorType.USER}
            actorId={(popUp.assumePrivileges.data as { userId: string })?.userId}
          />
          <UpgradePlanModal
            isOpen={popUp.upgradePlan.isOpen}
            onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
            text={popUp.upgradePlan?.data?.text}
            isEnterpriseFeature={popUp.upgradePlan?.data?.isEnterpriseFeature}
          />
          {isPermissionAuditOpen && (
            <MemberPermissionAuditSheet
              open={isPermissionAuditOpen}
              onOpenChange={setIsPermissionAuditOpen}
              membershipId={membershipId}
              targetName={memberDisplayName}
            />
          )}
        </>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>User not found</EmptyTitle>
            <EmptyDescription>
              This membership may have been removed or is no longer available.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
};

export const MemberDetailsByIDPage = () => {
  const { t } = useTranslation();

  return (
    <>
      <Helmet>
        <title>{t("common.head-title", { title: t("settings.members.title") })}</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <ProjectPermissionCan
        passThrough
        renderGuardBanner
        I={ProjectPermissionActions.Read}
        a={ProjectPermissionSub.Member}
      >
        <Page />
      </ProjectPermissionCan>
    </>
  );
};
