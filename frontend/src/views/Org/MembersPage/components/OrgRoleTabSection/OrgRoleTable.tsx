import { useState } from "react";
import { faEdit, faMagnifyingGlass, faPlus, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { useNotificationContext } from "@app/components/context/Notifications/NotificationProvider";
import { OrgPermissionCan } from "@app/components/permissions";
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
  Tr
} from "@app/components/v2";
import { OrgPermissionActions, OrgPermissionSubjects, useOrganization } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteRole } from "@app/hooks/api";
import { TRole } from "@app/hooks/api/roles/types";

type Props = {
  isRolesLoading?: boolean;
  roles?: TRole<undefined>[];
  onSelectRole: (role?: TRole<undefined>) => void;
};

export const OrgRoleTable = ({ isRolesLoading, roles = [], onSelectRole }: Props) => {
  const [searchRoles, setSearchRoles] = useState("");
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?._id || "";
  const { createNotification } = useNotificationContext();
  const { popUp, handlePopUpOpen, handlePopUpClose } = usePopUp(["deleteRole"] as const);

  const { mutateAsync: deleteRole } = useDeleteRole();

  const handleRoleDelete = async () => {
    const { _id: id } = popUp?.deleteRole?.data as TRole<undefined>;
    try {
      await deleteRole({
        orgId,
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
        <OrgPermissionCan I={OrgPermissionActions.Create} a={OrgPermissionSubjects.Role}>
          {(isAllowed) => (
            <Button
              isDisabled={!isAllowed}
              leftIcon={<FontAwesomeIcon icon={faPlus} />}
              onClick={() => onSelectRole()}
            >
              Add Role
            </Button>
          )}
        </OrgPermissionCan>
      </div>
      <div>
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th>Name</Th>
                <Th>Slug</Th>
                <Th aria-label="actions" />
              </Tr>
            </THead>
            <TBody>
              {isRolesLoading && <TableSkeleton columns={4} innerKey="org-roles" />}
              {roles?.map((role) => {
                const { _id: id, name, slug } = role;
                const isNonMutatable = ["owner", "admin", "member"].includes(slug);

                return (
                  <Tr key={`role-list-${id}`}>
                    <Td>{name}</Td>
                    <Td>{slug}</Td>
                    <Td className="flex justify-end">
                      <div className="flex space-x-2">
                        <OrgPermissionCan
                          I={OrgPermissionActions.Edit}
                          a={OrgPermissionSubjects.Role}
                          renderTooltip
                          allowedLabel="Edit"
                        >
                          {(isAllowed) => (
                            <IconButton
                              isDisabled={!isAllowed}
                              ariaLabel="edit"
                              onClick={() => onSelectRole(role)}
                              variant="plain"
                            >
                              <FontAwesomeIcon icon={faEdit} />
                            </IconButton>
                          )}
                        </OrgPermissionCan>
                        <OrgPermissionCan
                          I={OrgPermissionActions.Delete}
                          a={OrgPermissionSubjects.Role}
                          renderTooltip
                          allowedLabel={
                            isNonMutatable ? "Reserved roles are non-removable" : "Delete"
                          }
                        >
                          {(isAllowed) => (
                            <IconButton
                              ariaLabel="delete"
                              onClick={() => handlePopUpOpen("deleteRole", role)}
                              variant="plain"
                              isDisabled={isNonMutatable || !isAllowed}
                            >
                              <FontAwesomeIcon icon={faTrash} />
                            </IconButton>
                          )}
                        </OrgPermissionCan>
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
          (popUp?.deleteRole?.data as TRole<undefined>)?.name || " "
        } role?`}
        deleteKey={(popUp?.deleteRole?.data as TRole<undefined>)?.slug || ""}
        onClose={() => handlePopUpClose("deleteRole")}
        onDeleteApproved={handleRoleDelete}
      />
    </div>
  );
};
