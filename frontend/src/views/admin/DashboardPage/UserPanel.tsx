import { useMemo, useState } from "react";
import { faMagnifyingGlass, faUsers, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import {
  DeleteActionModal,
  EmptyState,
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
import { useUser } from "@app/context";
import { usePopUp } from "@app/hooks";
import { useDeleteUser, useListUsers } from "@app/hooks/api";

export const UserPanel = () => {
  const [searchMemberFilter, setSearchMemberFilter] = useState("");
  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "removeUser"
  ] as const);

  const { user } = useUser();
  const userId = user?.id || "";
  const { data: users, isLoading } = useListUsers();
  const { mutateAsync: deleteUser } = useDeleteUser();

  const filterdUsers = useMemo(
    () =>
      users?.filter(
        ({ firstName, lastName, username, email }) =>
          firstName?.toLowerCase().includes(searchMemberFilter.toLowerCase()) ||
          lastName?.toLowerCase().includes(searchMemberFilter.toLowerCase()) ||
          username?.toLowerCase().includes(searchMemberFilter.toLowerCase()) ||
          email?.toLowerCase().includes(searchMemberFilter.toLowerCase())
      ),
    [users, searchMemberFilter]
  );

  const handleRemoveUser = async () => {
    const { id } = popUp?.removeUser?.data as { id: string; username: string };

    try {
      await deleteUser(id);
      createNotification({
        type: "success",
        text: "Successfully deleted user"
      });
    } catch (err) {
      createNotification({
        type: "error",
        text: "Error deleting user"
      });
    }

    handlePopUpClose("removeUser");
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4">
        <p className="text-xl font-semibold text-mineshaft-100">Users</p>
      </div>
      <Input
        value={searchMemberFilter}
        onChange={(e) => setSearchMemberFilter(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search members..."
      />

      <div className="mt-4">
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th>Name</Th>
                <Th>Username</Th>
                <Th className="w-5" />
              </Tr>
            </THead>
            <TBody>
              {isLoading && <TableSkeleton columns={4} innerKey="users" />}
              {!isLoading &&
                filterdUsers?.map(({ username, email, firstName, lastName, id }) => {
                  const name = firstName || lastName ? `${firstName} ${lastName}` : "-";

                  return (
                    <Tr key={`user-${id}`} className="w-full">
                      <Td>{name}</Td>
                      <Td>{email}</Td>
                      <Td>
                        {userId !== id && (
                          <div className="flex items-center space-x-2">
                            <IconButton
                              size="lg"
                              colorSchema="danger"
                              variant="plain"
                              ariaLabel="update"
                              className="ml-4"
                              isDisabled={userId === id}
                              onClick={() => handlePopUpOpen("removeUser", { username, id })}
                            >
                              <FontAwesomeIcon icon={faXmark} />
                            </IconButton>
                          </div>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
            </TBody>
          </Table>
          {!isLoading && filterdUsers?.length === 0 && (
            <EmptyState title="No users found" icon={faUsers} />
          )}
        </TableContainer>
      </div>
      <DeleteActionModal
        isOpen={popUp.removeUser.isOpen}
        deleteKey="remove"
        title={`Are you sure you want to delete User with username ${
          (popUp?.removeUser?.data as { id: string; username: string })?.username || ""
        }?`}
        onChange={(isOpen) => handlePopUpToggle("removeUser", isOpen)}
        onDeleteApproved={handleRemoveUser}
      />
    </div>
  );
};
