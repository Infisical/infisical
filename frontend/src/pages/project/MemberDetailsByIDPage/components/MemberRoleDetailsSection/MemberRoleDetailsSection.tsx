import { useMemo } from "react";
import { format, formatDistance } from "date-fns";
import { ClockAlertIcon, ClockIcon, EllipsisIcon, PencilIcon } from "lucide-react";
import picomatch from "picomatch";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, Lottie, Modal, ModalContent } from "@app/components/v2";
import {
  Badge,
  Button,
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
} from "@app/components/v3/generic";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission,
  useUser
} from "@app/context";
import { formatProjectRoleName } from "@app/helpers/roles";
import { usePopUp } from "@app/hooks";
import { useUpdateUserWorkspaceRole } from "@app/hooks/api";
import { TProjectRole } from "@app/hooks/api/roles/types";
import { TWorkspaceUser } from "@app/hooks/api/types";
import { canModifyByGrantConditions, getGrantPrivilegeConditions } from "@app/lib/fn/permission";

import { MemberRoleModify } from "./MemberRoleModify";

type Props = {
  membershipDetails: TWorkspaceUser;
  isMembershipDetailsLoading?: boolean;
  onOpenUpgradeModal: () => void;
};

export const MemberRoleDetailsSection = ({
  membershipDetails,
  isMembershipDetailsLoading,
  onOpenUpgradeModal
}: Props) => {
  const { user } = useUser();
  const userId = user?.id;
  const { projectId } = useProject();
  const { permission } = useProjectPermission();

  const grantPrivilegeConditions = useMemo(
    () => getGrantPrivilegeConditions(permission),
    [permission]
  );

  const canModifyMemberRoles = useMemo(() => {
    const memberEmail = membershipDetails?.user?.email;
    if (!memberEmail) return false;

    return canModifyByGrantConditions({
      targetValue: memberEmail,
      allowed: grantPrivilegeConditions?.emails,
      forbidden: grantPrivilegeConditions?.forbiddenEmails,
      isMatch: (value, pattern) => picomatch.isMatch(value, pattern)
    });
  }, [grantPrivilegeConditions, membershipDetails?.user?.email]);

  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "deleteRole",
    "modifyRole"
  ] as const);
  const { mutateAsync: updateUserWorkspaceRole } = useUpdateUserWorkspaceRole();

  const isOwnProjectMembershipDetails = userId === membershipDetails?.user?.id;

  const handleRoleDelete = async () => {
    const { id } = popUp?.deleteRole?.data as TProjectRole;
    const updatedRoles = membershipDetails?.roles?.filter((el) => el.id !== id);
    await updateUserWorkspaceRole({
      projectId,
      roles: updatedRoles.map(
        ({
          role,
          customRoleSlug,
          isTemporary,
          temporaryMode,
          temporaryRange,
          temporaryAccessStartTime,
          temporaryAccessEndTime
        }) => ({
          role: role === "custom" ? customRoleSlug : role,
          ...(isTemporary
            ? {
                isTemporary,
                temporaryMode,
                temporaryRange,
                temporaryAccessStartTime,
                temporaryAccessEndTime
              }
            : {
                isTemporary
              })
        })
      ),
      membershipId: membershipDetails.id
    });
    createNotification({ type: "success", text: "Successfully removed role" });
    handlePopUpClose("deleteRole");
  };

  const hasRoles = Boolean(membershipDetails?.roles.length);

  return (
    <>
      <UnstableCard>
        <UnstableCardHeader>
          <UnstableCardTitle>Project Roles</UnstableCardTitle>
          <UnstableCardDescription>Manage roles assigned to this user</UnstableCardDescription>
          {!isOwnProjectMembershipDetails && hasRoles && (
            <UnstableCardAction>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Edit}
                a={ProjectPermissionSub.Member}
              >
                {(isAllowed) => {
                  const isEditDisabled = !isAllowed || !canModifyMemberRoles;
                  const button = (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => {
                        handlePopUpOpen("modifyRole");
                      }}
                      isDisabled={isEditDisabled}
                    >
                      <PencilIcon />
                      Edit Roles
                    </Button>
                  );
                  return isEditDisabled ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-block">{button}</span>
                      </TooltipTrigger>
                      <TooltipContent>
                        You don&apos;t have permission to edit this user&apos;s roles
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
          {
            /* eslint-disable-next-line no-nested-ternary */
            isMembershipDetailsLoading ? (
              // scott: todo proper loader
              <div className="flex h-40 w-full items-center justify-center">
                <Lottie icon="infisical_loading_white" isAutoPlay className="w-16" />
              </div>
            ) : hasRoles ? (
              <UnstableTable>
                <UnstableTableHeader>
                  <UnstableTableRow>
                    <UnstableTableHead className="w-1/2">Role</UnstableTableHead>
                    <UnstableTableHead className="w-1/2">Duration</UnstableTableHead>
                    {!isOwnProjectMembershipDetails && <UnstableTableHead className="w-5" />}
                  </UnstableTableRow>
                </UnstableTableHeader>
                <UnstableTableBody>
                  {membershipDetails?.roles?.map((roleDetails) => {
                    const isTemporary = roleDetails?.isTemporary;
                    const isExpired =
                      roleDetails.isTemporary &&
                      new Date() > new Date(roleDetails.temporaryAccessEndTime || "");

                    let text = "Permanent";
                    let toolTipText = "Non-Expiring Access";
                    if (roleDetails.isTemporary) {
                      if (isExpired) {
                        text = "Access Expired";
                        toolTipText = "Timed Access Expired";
                      } else {
                        text = formatDistance(
                          new Date(roleDetails.temporaryAccessEndTime || ""),
                          new Date()
                        );
                        toolTipText = `Until ${format(
                          new Date(roleDetails.temporaryAccessEndTime || ""),
                          "yyyy-MM-dd hh:mm:ss aaa"
                        )}`;
                      }
                    }

                    return (
                      <UnstableTableRow
                        className="group h-10"
                        key={`user-project-identity-${roleDetails?.id}`}
                      >
                        <UnstableTableCell className="max-w-0 truncate">
                          {roleDetails.role === "custom"
                            ? roleDetails.customRoleName
                            : formatProjectRoleName(roleDetails.role)}
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
                                <ProjectPermissionCan
                                  I={ProjectPermissionActions.Edit}
                                  a={ProjectPermissionSub.Member}
                                >
                                  {(isAllowed) => (
                                    <UnstableDropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handlePopUpOpen("deleteRole", {
                                          id: roleDetails?.id,
                                          slug: roleDetails?.customRoleName || roleDetails?.role
                                        });
                                      }}
                                      isDisabled={!isAllowed || !canModifyMemberRoles}
                                      variant="danger"
                                    >
                                      Remove Role
                                    </UnstableDropdownMenuItem>
                                  )}
                                </ProjectPermissionCan>
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
                  <UnstableEmptyTitle>This user doesn&apos;t have any roles</UnstableEmptyTitle>
                  <UnstableEmptyDescription>
                    Give this user one or more roles
                  </UnstableEmptyDescription>
                </UnstableEmptyHeader>
                <UnstableEmptyContent>
                  <ProjectPermissionCan
                    I={ProjectPermissionActions.Edit}
                    a={ProjectPermissionSub.Member}
                  >
                    {(isAllowed) => {
                      const isEditDisabled =
                        !isAllowed || isOwnProjectMembershipDetails || !canModifyMemberRoles;
                      const button = (
                        <Button
                          variant="project"
                          size="xs"
                          onClick={() => {
                            handlePopUpOpen("modifyRole");
                          }}
                          isDisabled={isEditDisabled}
                        >
                          <PencilIcon />
                          Edit Roles
                        </Button>
                      );
                      return isEditDisabled ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-block">{button}</span>
                          </TooltipTrigger>
                          <TooltipContent>
                            You don&apos;t have permission to edit this user&apos;s roles
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        button
                      );
                    }}
                  </ProjectPermissionCan>
                </UnstableEmptyContent>
              </UnstableEmpty>
            )
          }
        </UnstableCardContent>
      </UnstableCard>

      <DeleteActionModal
        isOpen={popUp.deleteRole.isOpen}
        deleteKey="remove"
        title={`Do you want to remove role ${(popUp?.deleteRole?.data as TProjectRole)?.slug}?`}
        onChange={(isOpen) => handlePopUpToggle("deleteRole", isOpen)}
        onDeleteApproved={() => handleRoleDelete()}
      />
      <Modal
        isOpen={popUp.modifyRole.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("modifyRole", isOpen)}
      >
        <ModalContent
          title="Roles"
          subTitle="Select one or more of the pre-defined or custom roles to configure project permissions."
        >
          <MemberRoleModify
            projectMember={membershipDetails}
            onOpenUpgradeModal={onOpenUpgradeModal}
          />
        </ModalContent>
      </Modal>
    </>
  );
};
