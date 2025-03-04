import { useState } from "react";
import { faMagnifyingGlass, faUsers, faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  DeleteActionModal,
  EmptyState,
  Input,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@app/components/v2";
import { useSubscription, useUser } from "@app/context";
import { useDebounce, usePopUp } from "@app/hooks";
import {
  useAdminDeleteUser,
  useAdminGetUsers,
  useAdminGrantServerAdminAccess
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const UserPanelTable = ({
  handlePopUpOpen
}: {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeUser", "upgradePlan", "upgradeToServerAdmin"]>,
    data?: {
      username: string;
      id: string;
    }
  ) => void;
}) => {
  const [searchUserFilter, setSearchUserFilter] = useState("");
  const { user } = useUser();
  const userId = user?.id || "";
  const [debounedSearchTerm] = useDebounce(searchUserFilter, 500);
  const { subscription } = useSubscription();

  const { data, isPending, isFetchingNextPage, hasNextPage, fetchNextPage } = useAdminGetUsers({
    limit: 20,
    searchTerm: debounedSearchTerm
  });

  const isEmpty = !isPending && !data?.pages?.[0].length;
  return (
    <>
      <Input
        value={searchUserFilter}
        onChange={(e) => setSearchUserFilter(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search users..."
      />
      <div className="mt-4">
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th className="w-5/12">Name</Th>
                <Th className="w-5/12">Username</Th>
                <Th className="w-5" />
              </Tr>
            </THead>
            <TBody>
              {isPending && <TableSkeleton columns={4} innerKey="users" />}
              {!isPending &&
                data?.pages?.map((users) =>
                  users.map(({ username, email, firstName, lastName, id, superAdmin }) => {
                    const name = firstName || lastName ? `${firstName} ${lastName}` : "-";

                    return (
                      <Tr key={`user-${id}`} className="w-full">
                        <Td className="w-5/12">
                          {name}
                          {superAdmin && (
                            <Badge variant="primary" className="ml-2">
                              Server Admin
                            </Badge>
                          )}
                        </Td>
                        <Td className="w-5/12">{email}</Td>
                        <Td>
                          {userId !== id && (
                            <div className="flex justify-end">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild className="rounded-lg">
                                  <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                                    <FontAwesomeIcon size="sm" icon={faEllipsis} />
                                  </div>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="start" className="p-1">
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!subscription?.instanceUserManagement) {
                                        handlePopUpOpen("upgradePlan");
                                        return;
                                      }
                                      handlePopUpOpen("removeUser", { username, id });
                                    }}
                                  >
                                    Remove User
                                  </DropdownMenuItem>
                                  {!superAdmin && ( 
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!subscription?.instanceUserManagement) {
                                          handlePopUpOpen("upgradePlan");
                                          return;
                                        }
                                        handlePopUpOpen("upgradeToServerAdmin", { username, id });
                                      }}
                                    >
                                      Make User Server Admin
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          )}
                        </Td>
                      </Tr>
                    );
                  })
                )}
            </TBody>
          </Table>
          {!isPending && isEmpty && <EmptyState title="No users found" icon={faUsers} />}
        </TableContainer>
        {!isEmpty && (
          <Button
            className="mt-4 py-3 text-sm"
            isFullWidth
            variant="star"
            isLoading={isFetchingNextPage}
            isDisabled={isFetchingNextPage || !hasNextPage}
            onClick={() => fetchNextPage()}
          >
            {hasNextPage ? "Load More" : "End of list"}
          </Button>
        )}
      </div>
    </>
  );
};

export const UserPanel = () => {
  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "removeUser",
    "upgradePlan",
    "upgradeToServerAdmin"
  ] as const);

  const { mutateAsync: deleteUser } = useAdminDeleteUser();
  const { mutateAsync: grantAdminAccess } = useAdminGrantServerAdminAccess();

  const handleRemoveUser = async () => {
    const { id } = popUp?.removeUser?.data as { id: string; username: string };

    try {
      await deleteUser(id);
      createNotification({
        type: "success",
        text: "Successfully deleted user"
      });
    } catch {
      createNotification({
        type: "error",
        text: "Error deleting user"
      });
    }

    handlePopUpClose("removeUser");
  };

  const handleGrantServerAdminAccess = async () => {
    const { id } = popUp?.upgradeToServerAdmin?.data as { id: string; username: string };

    try {
      await grantAdminAccess(id);
      createNotification({
        type: "success",
        text: "Successfully granted server admin access to user"
      });
    } catch {
      createNotification({
        type: "error",
        text: "Error granting server admin access to user"
      });
    }

    handlePopUpClose("upgradeToServerAdmin");
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4">
        <p className="text-xl font-semibold text-mineshaft-100">Users</p>
      </div>
      <UserPanelTable handlePopUpOpen={handlePopUpOpen} />
      <DeleteActionModal
        isOpen={popUp.removeUser.isOpen}
        deleteKey="remove"
        title={`Are you sure you want to delete User with username ${
          (popUp?.removeUser?.data as { id: string; username: string })?.username || ""
        }?`}
        onChange={(isOpen) => handlePopUpToggle("removeUser", isOpen)}
        onDeleteApproved={handleRemoveUser}
      />
      <DeleteActionModal
        isOpen={popUp.upgradeToServerAdmin.isOpen}
        title={`Are you sure want to grant Server Admin permissions to ${
          (popUp?.upgradeToServerAdmin?.data as { id: string; username: string })?.username || ""
        }?`}
        subTitle=""
        onChange={(isOpen) => handlePopUpToggle("upgradeToServerAdmin", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={handleGrantServerAdminAccess}
        buttonText="Grant Access"
      />
      <UpgradePlanModal
        isOpen={popUp.upgradePlan.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("upgradePlan", isOpen)}
        text="Deleting users via Admin UI is only available on Infisical's Pro plan and above."
      />
    </div>
  );
};
