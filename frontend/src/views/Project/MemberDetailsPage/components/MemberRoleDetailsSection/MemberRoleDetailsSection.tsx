import { createNotification } from "@app/components/notifications";
import {
  DeleteActionModal,
  IconButton,
  TableContainer,
  Td,
  Table,
  Tr,
  Th,
  THead,
  TableSkeleton,
  EmptyState,
  TBody,
  Tooltip
} from "@app/components/v2";
import { useUser, useWorkspace } from "@app/context";
import { usePopUp } from "@app/hooks";
import {
  useDeleteProjectRole,
  useGetWorkspaceUserDetails,
  useUpdateUserWorkspaceRole
} from "@app/hooks/api";
import { TProjectRole } from "@app/hooks/api/roles/types";
import { TWorkspaceUser } from "@app/hooks/api/types";
import { faFolder, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useRouter } from "next/router";

type Props = {
  membershipDetails: TWorkspaceUser;
  isMembershipDetailsLoading?: boolean;
};

export const MemberRoleDetailsSection = ({
  membershipDetails,
  isMembershipDetailsLoading
}: Props) => {
  const router = useRouter();
  const { user } = useUser();
  const { currentWorkspace } = useWorkspace();
  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp([
    "deleteRole"
  ] as const);
  const { mutateAsync: updateUserWorkspaceRole } = useUpdateUserWorkspaceRole();

  const userId = user?.id;

  const handleRoleDelete = async () => {
    const { id } = popUp?.deleteRole?.data as TProjectRole;
    try {
      const updatedRole = membershipDetails?.roles?.filter((el) => el.id !== id);
      await updateUserWorkspaceRole({
        workspaceId: currentWorkspace?.id || "",
        roles: updatedRole,
        membershipId: membershipDetails.id
      });
      createNotification({ type: "success", text: "Successfully removed the role" });
      handlePopUpClose("deleteRole");
    } catch (err) {
      console.log(err);
      createNotification({ type: "error", text: "Failed to delete role" });
    }
  };

  return (
    <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">Project Roles</h3>
        {userId !== membershipDetails?.user?.id && membershipDetails?.status !== "invited" && (
          <IconButton
            ariaLabel="copy icon"
            variant="plain"
            className="group relative"
            onClick={() => {}}
          >
            <FontAwesomeIcon icon={faPlus} />
          </IconButton>
        )}
      </div>
      <div className="py-4">
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th>Role</Th>
                <Th>Type</Th>
                <Th className="w-5" />
              </Tr>
            </THead>
            <TBody>
              {isMembershipDetailsLoading && (
                <TableSkeleton columns={3} innerKey="user-project-memberships" />
              )}
              {!isMembershipDetailsLoading &&
                membershipDetails?.roles?.map((roleDetails) => {
                  return (
                    <Tr className="group h-10" key={`user-project-membership-${roleDetails?.id}`}>
                      <Td>
                        {roleDetails.role === "custom"
                          ? roleDetails.customRoleName
                          : roleDetails.role}
                      </Td>
                      <Td>{!roleDetails.isTemporary ? "permanent" : "temporary"}</Td>
                      <Td>
                        <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                          <Tooltip content="Remove">
                            <IconButton
                              colorSchema="danger"
                              ariaLabel="copy icon"
                              variant="plain"
                              className="group relative"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePopUpOpen("deleteRole", {
                                  id: roleDetails?.id,
                                  slug: roleDetails?.customRoleSlug || roleDetails?.role
                                });
                              }}
                            >
                              <FontAwesomeIcon icon={faTrash} />
                            </IconButton>
                          </Tooltip>
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
            </TBody>
          </Table>
          {!isMembershipDetailsLoading && !membershipDetails?.roles?.length && (
            <EmptyState title="This user has not been assigned to any projects" icon={faFolder} />
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
    </div>
  );
};
