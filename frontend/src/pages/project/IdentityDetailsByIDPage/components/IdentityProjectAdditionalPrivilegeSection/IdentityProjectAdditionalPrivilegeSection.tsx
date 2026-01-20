import { subject } from "@casl/ability";
import { format, formatDistance } from "date-fns";
import { ClockAlertIcon, ClockIcon, EllipsisIcon, PlusIcon } from "lucide-react";

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
  ProjectPermissionIdentityActions,
  ProjectPermissionSub,
  useProject,
  useProjectPermission
} from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteIdentityProjectAdditionalPrivilege } from "@app/hooks/api";
import { IdentityProjectMembershipV1 } from "@app/hooks/api/identities/types";
import { useListIdentityProjectPrivileges } from "@app/hooks/api/identityProjectAdditionalPrivilege/queries";

import { IdentityProjectAdditionalPrivilegeModifySection } from "./IdentityProjectAdditionalPrivilegeModifySection";

type Props = {
  identityMembershipDetails: IdentityProjectMembershipV1;
};

export const IdentityProjectAdditionalPrivilegeSection = ({ identityMembershipDetails }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "deletePrivilege",
    "modifyPrivilege"
  ] as const);
  const { permission } = useProjectPermission();
  const identityId = identityMembershipDetails?.identity?.id;
  const { projectId } = useProject();

  const { mutateAsync: deletePrivilege } = useDeleteIdentityProjectAdditionalPrivilege();

  const { data: identityProjectPrivileges, isPending } = useListIdentityProjectPrivileges({
    identityId: identityMembershipDetails?.identity?.id,
    projectId
  });

  const handlePrivilegeDelete = async () => {
    const { id } = popUp?.deletePrivilege?.data as { id: string };
    await deletePrivilege({
      privilegeId: id,
      projectId,
      identityId
    });
    createNotification({ type: "success", text: "Successfully removed the privilege" });
    handlePopUpClose("deletePrivilege");
  };

  const hasAdditionalPrivileges = Boolean(identityProjectPrivileges?.length);

  return (
    <>
      <UnstableCard>
        <UnstableCardHeader>
          <UnstableCardTitle>Project Additional Privileges</UnstableCardTitle>
          <UnstableCardDescription>
            Assign one-off policies to this machine identity
          </UnstableCardDescription>
          {hasAdditionalPrivileges && (
            <UnstableCardAction>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Edit}
                a={subject(ProjectPermissionSub.Identity, {
                  identityId
                })}
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
          ) : identityProjectPrivileges?.length ? (
            <UnstableTable>
              <UnstableTableHeader>
                <UnstableTableRow>
                  <UnstableTableHead className="w-1/2">Name</UnstableTableHead>
                  <UnstableTableHead className="w-1/2">Duration</UnstableTableHead>
                  <UnstableTableHead className="w-5" />
                </UnstableTableRow>
              </UnstableTableHeader>
              <UnstableTableBody>
                {!isPending &&
                  identityProjectPrivileges?.map((privilegeDetails) => {
                    const isTemporary = privilegeDetails?.isTemporary;
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
                        <UnstableTableCell className="max-w-0 truncate">
                          {privilegeDetails.slug}
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
                                  identityId
                                })}
                                renderTooltip
                                allowedLabel="Remove Role"
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
                                a={subject(ProjectPermissionSub.Identity, {
                                  identityId
                                })}
                                renderTooltip
                                allowedLabel="Remove Role"
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
                  This machine identity has no additional privileges
                </UnstableEmptyTitle>
                <UnstableEmptyDescription>
                  Add an additional privilege to grant one-off access policies
                </UnstableEmptyDescription>
              </UnstableEmptyHeader>
              <UnstableEmptyContent>
                <ProjectPermissionCan
                  I={ProjectPermissionActions.Edit}
                  a={subject(ProjectPermissionSub.Identity, {
                    identityId
                  })}
                >
                  {(isAllowed) => (
                    <Button
                      variant="project"
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
              </UnstableEmptyContent>
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
          <IdentityProjectAdditionalPrivilegeModifySection
            onGoBack={() => handlePopUpClose("modifyPrivilege")}
            identityId={identityId}
            privilegeId={(popUp?.modifyPrivilege?.data as { id: string })?.id}
            isDisabled={permission.cannot(
              ProjectPermissionIdentityActions.Edit,
              subject(ProjectPermissionSub.Identity, {
                identityId
              })
            )}
          />
        </ModalContent>
      </Modal>
      <DeleteActionModal
        isOpen={popUp.deletePrivilege.isOpen}
        deleteKey="remove"
        title={`Do you want to remove privilege ${
          (popUp?.deletePrivilege?.data as { slug: string; id: string })?.slug
        }?`}
        onChange={(isOpen) => handlePopUpToggle("deletePrivilege", isOpen)}
        onDeleteApproved={() => handlePrivilegeDelete()}
      />
    </>
  );
};
