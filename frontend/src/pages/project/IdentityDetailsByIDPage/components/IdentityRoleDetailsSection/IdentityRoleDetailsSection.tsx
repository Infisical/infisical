import { useMemo } from "react";
import { subject } from "@casl/ability";
import { format, formatDistance } from "date-fns";
import { ClockAlertIcon, ClockIcon, EllipsisIcon, PencilIcon } from "lucide-react";

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
} from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import { formatProjectRoleName } from "@app/helpers/roles";
import { usePopUp } from "@app/hooks";
import { useUpdateProjectIdentityMembership } from "@app/hooks/api";
import { IdentityProjectMembershipV1 } from "@app/hooks/api/identities/types";
import { TProjectRole } from "@app/hooks/api/roles/types";
import { getIdentityGrantPrivilegeConditions } from "@app/lib/fn/permission";

import { IdentityRoleModify } from "./IdentityRoleModify";

type Props = {
  identityMembershipDetails: IdentityProjectMembershipV1;
  isMembershipDetailsLoading?: boolean;
};

export const IdentityRoleDetailsSection = ({
  identityMembershipDetails,
  isMembershipDetailsLoading
}: Props) => {
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "deleteRole",
    "modifyRole"
  ] as const);
  const { mutateAsync: updateIdentityProjectMembership } = useUpdateProjectIdentityMembership();

  const grantPrivilegeConditions = useMemo(
    () => getIdentityGrantPrivilegeConditions(permission),
    [permission]
  );

  const canModifyIdentityRoles = useMemo(() => {
    const targetIdentityId = identityMembershipDetails?.identity?.id;
    if (!targetIdentityId) return false;

    if (
      grantPrivilegeConditions?.forbiddenIdentityIds?.length &&
      grantPrivilegeConditions.forbiddenIdentityIds.includes(targetIdentityId)
    ) {
      return false;
    }

    if (
      !grantPrivilegeConditions?.identityIds ||
      grantPrivilegeConditions.identityIds.length === 0
    ) {
      return true;
    }
    return grantPrivilegeConditions.identityIds.includes(targetIdentityId);
  }, [grantPrivilegeConditions, identityMembershipDetails?.identity?.id]);

  const handleRoleDelete = async () => {
    const { id } = popUp?.deleteRole?.data as TProjectRole;
    const updatedRoles = identityMembershipDetails?.roles?.filter((el) => el.id !== id);
    await updateIdentityProjectMembership({
      projectId: currentProject?.id || "",
      identityId: identityMembershipDetails.identity.id,
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
      )
    });
    createNotification({ type: "success", text: "Successfully removed role" });
    handlePopUpClose("deleteRole");
  };

  const hasRoles = Boolean(identityMembershipDetails?.roles.length);

  return (
    <>
      <UnstableCard>
        <UnstableCardHeader>
          <UnstableCardTitle>Project Roles</UnstableCardTitle>
          <UnstableCardDescription>
            Manage roles assigned to this machine identity
          </UnstableCardDescription>
          {hasRoles && (
            <UnstableCardAction>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Edit}
                a={subject(ProjectPermissionSub.Identity, {
                  identityId: identityMembershipDetails.identity.id
                })}
              >
                {(isAllowed) => {
                  const isEditDisabled = !isAllowed || !canModifyIdentityRoles;
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
                        You don&apos;t have permission to edit this identity&apos;s roles
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
                    <UnstableTableHead className="w-5" />
                  </UnstableTableRow>
                </UnstableTableHeader>
                <UnstableTableBody>
                  {identityMembershipDetails?.roles?.map((roleDetails) => {
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
                      <UnstableTableRow key={`user-project-identity-${roleDetails?.id}`}>
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
                                a={subject(ProjectPermissionSub.Identity, {
                                  identityId: identityMembershipDetails.identity.id
                                })}
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
                                    isDisabled={!isAllowed || !canModifyIdentityRoles}
                                    variant="danger"
                                  >
                                    Remove Role
                                  </UnstableDropdownMenuItem>
                                )}
                              </ProjectPermissionCan>
                            </UnstableDropdownMenuContent>
                          </UnstableDropdownMenu>
                        </UnstableTableCell>
                      </UnstableTableRow>
                    );
                  })}
                </UnstableTableBody>
              </UnstableTable>
            ) : (
              <UnstableEmpty className="border">
                <UnstableEmptyHeader>
                  <UnstableEmptyTitle>
                    This machine identity doesn&apos;t have any roles
                  </UnstableEmptyTitle>
                  <UnstableEmptyDescription>
                    Give this machine identity one or more roles
                  </UnstableEmptyDescription>
                </UnstableEmptyHeader>
                <UnstableEmptyContent>
                  <ProjectPermissionCan
                    I={ProjectPermissionActions.Edit}
                    a={subject(ProjectPermissionSub.Identity, {
                      identityId: identityMembershipDetails.identity.id
                    })}
                  >
                    {(isAllowed) => {
                      const isEditDisabled = !isAllowed || !canModifyIdentityRoles;
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
                            You don&apos;t have permission to edit this identity&apos;s roles
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
          <IdentityRoleModify identityProjectMembership={identityMembershipDetails} />
        </ModalContent>
      </Modal>
    </>
  );
};
