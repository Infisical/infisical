import { subject } from "@casl/ability";
import { faEllipsisV, faFolder, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format, formatDistance } from "date-fns";
import { AnimatePresence, motion } from "framer-motion";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DeleteActionModal,
  EmptyState,
  IconButton,
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

  return (
    <div className="relative">
      <AnimatePresence>
        {popUp?.modifyPrivilege.isOpen ? (
          <motion.div
            key="privilege-modify"
            transition={{ duration: 0.3 }}
            initial={{ opacity: 0, translateX: 30 }}
            animate={{ opacity: 1, translateX: 0 }}
            exit={{ opacity: 0, translateX: 30 }}
            className="absolute min-h-40 w-full"
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
          </motion.div>
        ) : (
          <motion.div
            key="privilege-list"
            transition={{ duration: 0.3 }}
            initial={{ opacity: 0, translateX: 0 }}
            animate={{ opacity: 1, translateX: 0 }}
            exit={{ opacity: 0, translateX: -30 }}
            className="absolute w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
          >
            <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
              <h3 className="text-lg font-medium text-mineshaft-100">
                Project Additional Privileges
              </h3>

              <ProjectPermissionCan
                I={ProjectPermissionActions.Edit}
                a={subject(ProjectPermissionSub.Identity, {
                  identityId
                })}
                renderTooltip
                allowedLabel="Add Privilege"
              >
                {(isAllowed) => (
                  <IconButton
                    ariaLabel="copy icon"
                    variant="plain"
                    className="group relative"
                    onClick={() => {
                      handlePopUpOpen("modifyPrivilege");
                    }}
                    isDisabled={!isAllowed}
                  >
                    <FontAwesomeIcon icon={faPlus} />
                  </IconButton>
                )}
              </ProjectPermissionCan>
            </div>
            <div className="py-4">
              <TableContainer>
                <Table>
                  <THead>
                    <Tr>
                      <Th>Name</Th>
                      <Th>Duration</Th>
                      <Th className="w-5" />
                    </Tr>
                  </THead>
                  <TBody>
                    {isPending && (
                      <TableSkeleton columns={3} innerKey="user-project-identity-memberships" />
                    )}
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
                          <Tr
                            key={`user-project-privilege-${privilegeDetails?.id}`}
                            className="group w-full cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
                            role="button"
                            tabIndex={0}
                            onKeyDown={(evt) => {
                              if (evt.key === "Enter") {
                                handlePopUpOpen("modifyPrivilege", privilegeDetails);
                              }
                            }}
                            onClick={() => handlePopUpOpen("modifyPrivilege", privilegeDetails)}
                          >
                            <Td>{privilegeDetails.slug}</Td>
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
                              <div className="flex space-x-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                                <ProjectPermissionCan
                                  I={ProjectPermissionActions.Edit}
                                  a={subject(ProjectPermissionSub.Identity, {
                                    identityId
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
                                        e.preventDefault();
                                        handlePopUpOpen("deletePrivilege", {
                                          id: privilegeDetails?.id,
                                          slug: privilegeDetails?.slug
                                        });
                                      }}
                                    >
                                      <FontAwesomeIcon icon={faTrash} />
                                    </IconButton>
                                  )}
                                </ProjectPermissionCan>
                                <IconButton ariaLabel="more-icon" variant="plain">
                                  <FontAwesomeIcon icon={faEllipsisV} />
                                </IconButton>
                              </div>
                            </Td>
                          </Tr>
                        );
                      })}
                  </TBody>
                </Table>
                {!isPending && !identityProjectPrivileges?.length && (
                  <EmptyState
                    title="This machine identity has no additional privileges"
                    icon={faFolder}
                  />
                )}
              </TableContainer>
            </div>
            <DeleteActionModal
              isOpen={popUp.deletePrivilege.isOpen}
              deleteKey="remove"
              title={`Do you want to remove privilege ${
                (popUp?.deletePrivilege?.data as { slug: string; id: string })?.slug
              }?`}
              onChange={(isOpen) => handlePopUpToggle("deletePrivilege", isOpen)}
              onDeleteApproved={() => handlePrivilegeDelete()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
