import { useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { format, formatDistance } from "date-fns";
import { ClockAlertIcon, ClockIcon, EllipsisIcon, PlusIcon, ShieldIcon } from "lucide-react";
import picomatch from "picomatch";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, Lottie } from "@app/components/v2";
import {
  Badge,
  Button,
  DocumentationLinkBadge,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableEmpty,
  UnstableEmptyContent,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle,
  UnstableIconButton,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionMemberActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission,
  useUser
} from "@app/context";
import { usePopUp } from "@app/hooks";
import {
  useDeleteProjectUserAdditionalPrivilege,
  useListProjectUserPrivileges,
  useRevokeAccessRequest
} from "@app/hooks/api";
import { projectUserPrivilegeKeys } from "@app/hooks/api/projectUserAdditionalPrivilege/queries";
import { TWorkspaceUser } from "@app/hooks/api/types";
import {
  canModifyByGrantConditions,
  getMemberAssignPrivilegesConditions
} from "@app/lib/fn/permission";

import { MembershipProjectAdditionalPrivilegeModifySection } from "./MembershipProjectAdditionalPrivilegeModifySection";

type Props = {
  membershipDetails: TWorkspaceUser;
};

export const MemberProjectAdditionalPrivilegeSection = ({ membershipDetails }: Props) => {
  const sheetContainerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { user } = useUser();
  const userId = user?.id;
  const { currentProject } = useProject();
  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "deletePrivilege",
    "modifyPrivilege",
    "revokeAccess"
  ] as const);
  const { permission } = useProjectPermission();

  const { mutateAsync: deletePrivilege } = useDeleteProjectUserAdditionalPrivilege();
  const { mutateAsync: revokeAccessRequest } = useRevokeAccessRequest();

  const { data: userProjectPrivileges, isPending } = useListProjectUserPrivileges(
    membershipDetails?.id
  );

  const isOwnProjectMembershipDetails = userId === membershipDetails?.user?.id;

  const assignPrivilegesConditions = useMemo(
    () => getMemberAssignPrivilegesConditions(permission),
    [permission]
  );

  const canModifyMemberPrivileges = useMemo(() => {
    const targetEmail = membershipDetails?.user?.email;
    if (!targetEmail) return false;

    return canModifyByGrantConditions({
      targetValue: targetEmail,
      allowed: assignPrivilegesConditions?.emails,
      forbidden: assignPrivilegesConditions?.forbiddenEmails,
      isMatch: (value, pattern) => picomatch.isMatch(value, pattern, { nocase: true })
    });
  }, [assignPrivilegesConditions, membershipDetails?.user?.email]);

  const handlePrivilegeDelete = async () => {
    const { id } = popUp?.deletePrivilege?.data as { id: string };
    await deletePrivilege({
      privilegeId: id,
      projectMembershipId: membershipDetails.id
    });
    createNotification({ type: "success", text: "Successfully removed the privilege" });
    handlePopUpClose("deletePrivilege");
  };

  const handleRevokeAccess = async () => {
    const { accessApprovalRequestId } = popUp?.revokeAccess?.data as {
      accessApprovalRequestId: string;
    };
    await revokeAccessRequest({
      requestId: accessApprovalRequestId,
      projectSlug: currentProject?.slug || ""
    });
    await queryClient.invalidateQueries({
      queryKey: projectUserPrivilegeKeys.list(membershipDetails.id)
    });
    createNotification({ type: "success", text: "Successfully revoked access" });
    handlePopUpClose("revokeAccess");
  };

  const hasAdditionalPrivileges = Boolean(userProjectPrivileges?.length);

  return (
    <>
      <UnstableCard>
        <UnstableCardHeader>
          <UnstableCardTitle>
            Project Additional Privileges
            <DocumentationLinkBadge href="https://infisical.com/docs/documentation/platform/access-controls/additional-privileges#api" />
          </UnstableCardTitle>
          <UnstableCardDescription>Assign one-off policies to this user</UnstableCardDescription>
          {!isOwnProjectMembershipDetails && hasAdditionalPrivileges && (
            <UnstableCardAction>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Edit}
                a={ProjectPermissionSub.Member}
              >
                {(isAllowed) => {
                  const isEditDisabled = !isAllowed || !canModifyMemberPrivileges;
                  const button = (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        handlePopUpOpen("modifyPrivilege");
                      }}
                      isDisabled={isEditDisabled}
                    >
                      <PlusIcon />
                      Add Additional Privileges
                    </Button>
                  );
                  return isEditDisabled ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-block">{button}</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        You don&apos;t have permission to edit this user&apos;s privileges
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    button
                  );
                }}
              </ProjectPermissionCan>
            </UnstableCardAction>
          )}
        </UnstableCardHeader>
        <UnstableCardContent>
          {/* eslint-disable-next-line no-nested-ternary */}
          {isPending ? (
            // scott: todo proper loader
            <div className="flex h-40 w-full items-center justify-center">
              <Lottie icon="infisical_loading_white" isAutoPlay className="w-16" />
            </div>
          ) : userProjectPrivileges?.length ? (
            <UnstableTable>
              <UnstableTableHeader>
                <UnstableTableRow>
                  <UnstableTableHead className="w-1/2">Name</UnstableTableHead>
                  <UnstableTableHead className="w-1/2">Duration</UnstableTableHead>
                  {!isOwnProjectMembershipDetails && <UnstableTableHead className="w-5" />}
                </UnstableTableRow>
              </UnstableTableHeader>
              <UnstableTableBody>
                {!isPending &&
                  userProjectPrivileges?.map((privilegeDetails) => {
                    const isTemporary = privilegeDetails?.isTemporary;
                    const isLinkedToAccessApproval = privilegeDetails?.isLinkedToAccessApproval;
                    const isExpired =
                      privilegeDetails.isTemporary &&
                      new Date() > new Date(privilegeDetails.temporaryAccessEndTime || "");

                    let text = "Permanent";
                    let toolTipText = "Non-Expiring Access";
                    if (privilegeDetails.isTemporary) {
                      if (isExpired) {
                        text = "Access Expired";
                        toolTipText = "Timed Access Expired";
                      } else {
                        text = formatDistance(
                          new Date(privilegeDetails.temporaryAccessEndTime || ""),
                          new Date()
                        );
                        toolTipText = `Until ${format(
                          new Date(privilegeDetails.temporaryAccessEndTime || ""),
                          "yyyy-MM-dd hh:mm:ss aaa"
                        )}`;
                      }
                    }

                    return (
                      <UnstableTableRow key={`user-project-privilege-${privilegeDetails?.id}`}>
                        <UnstableTableCell className="flex items-center gap-2">
                          <span className="truncate">{privilegeDetails.slug}</span>
                          {isLinkedToAccessApproval && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge className="capitalize" variant="info">
                                  <ShieldIcon />
                                  Managed
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                This privilege is managed by an access approval request.
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </UnstableTableCell>
                        <UnstableTableCell>
                          {isTemporary ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Badge
                                  className="capitalize"
                                  variant={isExpired ? "danger" : "warning"}
                                >
                                  {isExpired ? <ClockAlertIcon /> : <ClockIcon />}
                                  {text}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>{toolTipText}</TooltipContent>
                            </Tooltip>
                          ) : (
                            text
                          )}
                        </UnstableTableCell>
                        {!isOwnProjectMembershipDetails && (
                          <UnstableTableCell>
                            <UnstableDropdownMenu>
                              <UnstableDropdownMenuTrigger asChild>
                                <UnstableIconButton size="xs" variant="ghost">
                                  <EllipsisIcon />
                                </UnstableIconButton>
                              </UnstableDropdownMenuTrigger>
                              <UnstableDropdownMenuContent align="end">
                                {isLinkedToAccessApproval ? (
                                  <ProjectPermissionCan
                                    I={ProjectPermissionMemberActions.AssignAdditionalPrivileges}
                                    a={ProjectPermissionSub.Member}
                                  >
                                    {(isAllowed) => {
                                      const isApproverForPrivilege =
                                        privilegeDetails.policyApproverUserIds?.includes(
                                          userId || ""
                                        );
                                      return (
                                        <UnstableDropdownMenuItem
                                          isDisabled={
                                            !privilegeDetails.accessApprovalRequestId ||
                                            ((!isAllowed || !canModifyMemberPrivileges) &&
                                              !isApproverForPrivilege)
                                          }
                                          variant="danger"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handlePopUpOpen("revokeAccess", {
                                              accessApprovalRequestId:
                                                privilegeDetails.accessApprovalRequestId,
                                              slug: privilegeDetails.slug
                                            });
                                          }}
                                        >
                                          Revoke Access
                                        </UnstableDropdownMenuItem>
                                      );
                                    }}
                                  </ProjectPermissionCan>
                                ) : (
                                  <>
                                    <ProjectPermissionCan
                                      I={ProjectPermissionActions.Edit}
                                      a={ProjectPermissionSub.Member}
                                    >
                                      {(isAllowed) => (
                                        <UnstableDropdownMenuItem
                                          isDisabled={!isAllowed || !canModifyMemberPrivileges}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handlePopUpOpen("modifyPrivilege", privilegeDetails);
                                          }}
                                        >
                                          Edit Additional Privilege
                                        </UnstableDropdownMenuItem>
                                      )}
                                    </ProjectPermissionCan>
                                    <ProjectPermissionCan
                                      I={ProjectPermissionActions.Edit}
                                      a={ProjectPermissionSub.Member}
                                    >
                                      {(isAllowed) => (
                                        <UnstableDropdownMenuItem
                                          isDisabled={!isAllowed || !canModifyMemberPrivileges}
                                          variant="danger"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handlePopUpOpen("deletePrivilege", {
                                              id: privilegeDetails?.id,
                                              slug: privilegeDetails?.slug
                                            });
                                          }}
                                        >
                                          Remove Additional Privilege
                                        </UnstableDropdownMenuItem>
                                      )}
                                    </ProjectPermissionCan>
                                  </>
                                )}
                              </UnstableDropdownMenuContent>
                            </UnstableDropdownMenu>
                          </UnstableTableCell>
                        )}
                      </UnstableTableRow>
                    );
                  })}
              </UnstableTableBody>
            </UnstableTable>
          ) : (
            <UnstableEmpty className="border">
              <UnstableEmptyHeader>
                <UnstableEmptyTitle>This user has no additional privileges</UnstableEmptyTitle>
                <UnstableEmptyDescription>
                  Add an additional privilege to grant one-off access policies
                </UnstableEmptyDescription>
              </UnstableEmptyHeader>
              {!isOwnProjectMembershipDetails && (
                <UnstableEmptyContent>
                  <ProjectPermissionCan
                    I={ProjectPermissionActions.Edit}
                    a={ProjectPermissionSub.Member}
                  >
                    {(isAllowed) => {
                      const isEditDisabled = !isAllowed || !canModifyMemberPrivileges;
                      const button = (
                        <Button
                          variant="project"
                          size="xs"
                          onClick={() => {
                            handlePopUpOpen("modifyPrivilege");
                          }}
                          isDisabled={isEditDisabled}
                        >
                          <PlusIcon />
                          Add Additional Privileges
                        </Button>
                      );
                      return isEditDisabled ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-block">{button}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            You don&apos;t have permission to edit this user&apos;s privileges
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        button
                      );
                    }}
                  </ProjectPermissionCan>
                </UnstableEmptyContent>
              )}
            </UnstableEmpty>
          )}
        </UnstableCardContent>
      </UnstableCard>
      <Sheet
        open={popUp.modifyPrivilege.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("modifyPrivilege", isOpen)}
      >
        <SheetContent ref={sheetContainerRef} className="flex h-full flex-col gap-y-0 sm:max-w-6xl">
          <SheetHeader className="border-b">
            <SheetTitle>Additional Privileges</SheetTitle>
            <SheetDescription>
              Additional privileges take precedence over roles when permissions conflict
            </SheetDescription>
          </SheetHeader>
          <MembershipProjectAdditionalPrivilegeModifySection
            onGoBack={() => handlePopUpClose("modifyPrivilege")}
            projectMembershipId={membershipDetails?.id}
            privilegeId={(popUp?.modifyPrivilege?.data as { id: string })?.id}
            isDisabled={
              isOwnProjectMembershipDetails ||
              permission.cannot(ProjectPermissionMemberActions.Edit, ProjectPermissionSub.Member)
            }
            menuPortalContainerRef={sheetContainerRef}
          />
        </SheetContent>
      </Sheet>
      <DeleteActionModal
        isOpen={popUp.deletePrivilege.isOpen}
        deleteKey="remove"
        title={`Do you want to remove role ${
          (popUp?.deletePrivilege?.data as { slug: string; id: string })?.slug
        }?`}
        onChange={(isOpen) => handlePopUpToggle("deletePrivilege", isOpen)}
        onDeleteApproved={() => handlePrivilegeDelete()}
      />
      <DeleteActionModal
        isOpen={popUp.revokeAccess.isOpen}
        deleteKey="revoke"
        title={`Do you want to revoke access for ${
          (popUp?.revokeAccess?.data as { slug: string })?.slug
        }?`}
        subTitle="This will revoke the granted access approval request and remove the associated privilege."
        onChange={(isOpen) => handlePopUpToggle("revokeAccess", isOpen)}
        onDeleteApproved={() => handleRevokeAccess()}
      />
    </>
  );
};
