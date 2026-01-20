import { format, formatDistance } from "date-fns";
import { ClockAlertIcon, ClockIcon, EllipsisIcon, PlusIcon, ShieldIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { DeleteActionModal, Lottie, Modal, ModalContent, Tooltip } from "@app/components/v2";
import {
  Badge,
  Button,
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
  useProjectPermission,
  useUser
} from "@app/context";
import { usePopUp } from "@app/hooks";
import {
  useDeleteProjectUserAdditionalPrivilege,
  useListProjectUserPrivileges
} from "@app/hooks/api";
import { TWorkspaceUser } from "@app/hooks/api/types";

import { MembershipProjectAdditionalPrivilegeModifySection } from "./MembershipProjectAdditionalPrivilegeModifySection";

type Props = {
  membershipDetails: TWorkspaceUser;
};

export const MemberProjectAdditionalPrivilegeSection = ({ membershipDetails }: Props) => {
  const { user } = useUser();
  const userId = user?.id;
  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "deletePrivilege",
    "modifyPrivilege"
  ] as const);
  const { permission } = useProjectPermission();

  const { mutateAsync: deletePrivilege } = useDeleteProjectUserAdditionalPrivilege();

  const { data: userProjectPrivileges, isPending } = useListProjectUserPrivileges(
    membershipDetails?.id
  );

  const isOwnProjectMembershipDetails = userId === membershipDetails?.user?.id;

  const handlePrivilegeDelete = async () => {
    const { id } = popUp?.deletePrivilege?.data as { id: string };
    await deletePrivilege({
      privilegeId: id,
      projectMembershipId: membershipDetails.id
    });
    createNotification({ type: "success", text: "Successfully removed the privilege" });
    handlePopUpClose("deletePrivilege");
  };

  const hasAdditionalPrivileges = Boolean(userProjectPrivileges?.length);

  return (
    <>
      <UnstableCard>
        <UnstableCardHeader>
          <UnstableCardTitle>Project Additional Privileges</UnstableCardTitle>
          <UnstableCardDescription>Assign one-off policies to this user</UnstableCardDescription>
          {!isOwnProjectMembershipDetails && hasAdditionalPrivileges && (
            <UnstableCardAction>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Edit}
                a={ProjectPermissionSub.Member}
              >
                {(isAllowed) => (
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      handlePopUpOpen("modifyPrivilege");
                    }}
                    isDisabled={!isAllowed}
                  >
                    <PlusIcon />
                    Add Additional Privileges
                  </Button>
                )}
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
                            <Tooltip content="This privilege was granted via an access request, therefore it cannot be edited or deleted">
                              <Badge className="capitalize" variant="info">
                                <ShieldIcon />
                                Managed
                              </Badge>
                            </Tooltip>
                          )}
                        </UnstableTableCell>
                        <UnstableTableCell>
                          {isTemporary ? (
                            <Tooltip content={toolTipText}>
                              <Badge
                                className="capitalize"
                                variant={isExpired ? "danger" : "warning"}
                              >
                                {isExpired ? <ClockAlertIcon /> : <ClockIcon />}
                                {text}
                              </Badge>
                            </Tooltip>
                          ) : (
                            text
                          )}
                        </UnstableTableCell>
                        {!isOwnProjectMembershipDetails && (
                          <UnstableTableCell>
                            {!isLinkedToAccessApproval && (
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
                                        isDisabled={!isAllowed}
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
                                        isDisabled={!isAllowed}
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
                                </UnstableDropdownMenuContent>
                              </UnstableDropdownMenu>
                            )}
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
                    {(isAllowed) => (
                      <Button
                        variant="project"
                        size="xs"
                        onClick={() => {
                          handlePopUpOpen("modifyPrivilege");
                        }}
                        isDisabled={!isAllowed || isOwnProjectMembershipDetails}
                      >
                        <PlusIcon />
                        Add Additional Privileges
                      </Button>
                    )}
                  </ProjectPermissionCan>
                </UnstableEmptyContent>
              )}
            </UnstableEmpty>
          )}
        </UnstableCardContent>
      </UnstableCard>
      <Modal
        isOpen={popUp.modifyPrivilege.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("modifyPrivilege", isOpen)}
      >
        <ModalContent
          className="max-w-6xl"
          title="Additional Privileges"
          subTitle="Additional privileges take precedence over roles when permissions conflict"
        >
          <MembershipProjectAdditionalPrivilegeModifySection
            onGoBack={() => handlePopUpClose("modifyPrivilege")}
            projectMembershipId={membershipDetails?.id}
            privilegeId={(popUp?.modifyPrivilege?.data as { id: string })?.id}
            isDisabled={
              isOwnProjectMembershipDetails ||
              permission.cannot(ProjectPermissionMemberActions.Edit, ProjectPermissionSub.Member)
            }
          />
        </ModalContent>
      </Modal>
      <DeleteActionModal
        isOpen={popUp.deletePrivilege.isOpen}
        deleteKey="remove"
        title={`Do you want to remove role ${
          (popUp?.deletePrivilege?.data as { slug: string; id: string })?.slug
        }?`}
        onChange={(isOpen) => handlePopUpToggle("deletePrivilege", isOpen)}
        onDeleteApproved={() => handlePrivilegeDelete()}
      />
    </>
  );
};
