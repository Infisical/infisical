import { useState } from "react";
import { faEdit, faMagnifyingGlass, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import {
  Button,
  DeleteActionModal,
  IconButton,
  Input,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import { useOrganization, useWorkspace } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteRole } from "@app/hooks/api";
import { TRole } from "@app/hooks/api/roles/types";

type Props = {
  isRolesLoading?: boolean;
  roles?: TRole<string>[];
  onSelectRole: (role?: TRole<string>) => void;
};

export const ProjectRoleList = ({ isRolesLoading, roles = [], onSelectRole }: Props) => {
  const [searchRoles, setSearchRoles] = useState("");
  const { currentOrg } = useOrganization();
  const { currentWorkspace } = useWorkspace();
  const orgId = currentOrg?._id || "";
  const workspaceId = currentWorkspace?._id || "";

  const { createNotification } = useNotificationContext();
  const { popUp, handlePopUpOpen, handlePopUpClose } = usePopUp(["deleteRole"] as const);

  const { mutateAsync: deleteRole } = useDeleteRole();

  const handleRoleDelete = async () => {
    const { _id: id } = popUp?.deleteRole?.data as TRole<string>;
    try {
      await deleteRole({
        orgId,
        workspaceId,
        id
      });
      createNotification({ type: "success", text: "Successfully removed the role" });
      handlePopUpClose("deleteRole");
    } catch (err) {
      console.log(err);
      createNotification({ type: "error", text: "Failed to create role" });
    }
  };

  return (
    <div className="w-full">
      <div className="mb-4 flex">
        <div className="mr-4 flex-1">
          <Input
            value={searchRoles}
            onChange={(e) => setSearchRoles(e.target.value)}
            leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
            placeholder="Search roles..."
          />
        </div>
        <Button leftIcon={<FontAwesomeIcon icon={faPlus} />} onClick={() => onSelectRole()}>
          Add Role
        </Button>
      </div>
      <div>
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th>Name</Th>
                <Th>Slug</Th>
                <Th>Created At</Th>
                <Th aria-label="actions" />
              </Tr>
            </THead>
            <TBody>
              {isRolesLoading && <TableSkeleton columns={4} innerKey="org-roles" />}
              {roles?.map((role) => {
                const { _id: id, name, createdAt, slug } = role;
                const isNonMutatable = ["owner", "admin", "member"].includes(slug);

                return (
                  <Tr key={`role-list-${id}`}>
                    <Td>{name}</Td>
                    <Td>{slug}</Td>
                    <Td>
                      {createdAt ? format(new Date(createdAt), "yyyy-MM-dd, hh:mm aaa") : "-"}
                    </Td>
                    <Td>
                      <div className="flex space-x-2 items-center">
                        <Tooltip content="Edit">
                          <IconButton
                            ariaLabel="edit"
                            onClick={() => onSelectRole(role)}
                            variant="plain"
                          >
                            <FontAwesomeIcon icon={faEdit} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip
                          content={isNonMutatable ? "Reserved roles are non-removable" : "Delete"}
                        >
                          <IconButton
                            ariaLabel="delete"
                            onClick={() => handlePopUpOpen("deleteRole", role)}
                            variant="plain"
                            isDisabled={isNonMutatable}
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
        </TableContainer>
      </div>
      <DeleteActionModal
        isOpen={popUp.deleteRole.isOpen}
        title={`Are you sure want to delete ${
          (popUp?.deleteRole?.data as TRole<string>)?.name || " "
        } role?`}
        deleteKey={(popUp?.deleteRole?.data as TRole<string>)?.slug || ""}
        onClose={() => handlePopUpClose("deleteRole")}
        onDeleteApproved={handleRoleDelete}
      />
    </div>
  );
};
