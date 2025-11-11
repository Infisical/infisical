import { subject } from "@casl/ability";
import { faFolder, faPencil, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format, formatDistance } from "date-fns";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DeleteActionModal,
  EmptyState,
  IconButton,
  Modal,
  ModalContent,
  Table,
  TableContainer,
  TableSkeleton,
  Tag,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useProject } from "@app/context";
import { formatProjectRoleName } from "@app/helpers/roles";
import { usePopUp } from "@app/hooks";
import { useUpdateProjectIdentityMembership } from "@app/hooks/api";
import { IdentityProjectMembershipV1 } from "@app/hooks/api/identities/types";
import { TProjectRole } from "@app/hooks/api/roles/types";

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
  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "deleteRole",
    "modifyRole"
  ] as const);
  const { mutateAsync: updateIdentityProjectMembership } = useUpdateProjectIdentityMembership();

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

  return (
    <div className="mb-4 w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-medium text-mineshaft-100">Project Roles</h3>
        <ProjectPermissionCan
          I={ProjectPermissionActions.Edit}
          a={subject(ProjectPermissionSub.Identity, {
            identityId: identityMembershipDetails.identity.id
          })}
          renderTooltip
          allowedLabel="Edit Role(s)"
        >
          {(isAllowed) => (
            <IconButton
              ariaLabel="copy icon"
              variant="plain"
              className="group relative"
              onClick={() => {
                handlePopUpOpen("modifyRole");
              }}
              isDisabled={!isAllowed}
            >
              <FontAwesomeIcon icon={faPencil} />
            </IconButton>
          )}
        </ProjectPermissionCan>
      </div>
      <div className="py-4">
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th>Role</Th>
                <Th>Duration</Th>
                <Th className="w-5" />
              </Tr>
            </THead>
            <TBody>
              {isMembershipDetailsLoading && (
                <TableSkeleton columns={3} innerKey="user-project-identities" />
              )}
              {!isMembershipDetailsLoading &&
                identityMembershipDetails?.roles?.map((roleDetails) => {
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
                    <Tr className="group h-10" key={`user-project-identity-${roleDetails?.id}`}>
                      <Td className="capitalize">
                        {roleDetails.role === "custom"
                          ? roleDetails.customRoleName
                          : formatProjectRoleName(roleDetails.role)}
                      </Td>
                      <Td>
                        <Tooltip asChild={false} content={toolTipText}>
                          <Tag
                            className={twMerge(
                              "capitalize",
                              isTemporary && "text-primary",
                              isExpired && "text-red-600"
                            )}
                          >
                            {text}
                          </Tag>
                        </Tooltip>
                      </Td>
                      <Td>
                        <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Edit}
                            a={subject(ProjectPermissionSub.Identity, {
                              identityId: identityMembershipDetails.identity.id
                            })}
                            renderTooltip
                            allowedLabel="Remove Role"
                          >
                            {(isAllowed) => (
                              <IconButton
                                colorSchema="danger"
                                ariaLabel="copy icon"
                                variant="plain"
                                className="group relative"
                                isDisabled={!isAllowed}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("deleteRole", {
                                    id: roleDetails?.id,
                                    slug: roleDetails?.customRoleName || roleDetails?.role
                                  });
                                }}
                              >
                                <FontAwesomeIcon icon={faTrash} />
                              </IconButton>
                            )}
                          </ProjectPermissionCan>
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
            </TBody>
          </Table>
          {!isMembershipDetailsLoading && !identityMembershipDetails?.roles?.length && (
            <EmptyState title="This user has no roles" icon={faFolder} />
          )}
        </TableContainer>
      </div>
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
    </div>
  );
};
