import { useState } from "react";
import {
  faCheckCircle,
  faEllipsis,
  faFilter,
  faMagnifyingGlass,
  faUsers
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

import { UpgradePlanModal } from "@app/components/license/UpgradePlanModal";
import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Input,
  Switch,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { useSubscription, useUser } from "@app/context";
import { useDebounce, usePopUp } from "@app/hooks";
import {
  useAdminDeleteUser,
  useAdminGetUsers,
  useAdminGrantServerAdminAccess
} from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

const deleteUserUpgradePlanMessage = "Deleting users via Admin UI";
const addServerAdminUpgradePlanMessage = "Granting another user Server Admin permissions";

const UserPanelTable = ({
  handlePopUpOpen
}: {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeUser", "upgradePlan", "upgradeToServerAdmin"]>,
    data?: {
      username: string;
      id: string;
      message?: string;
    }
  ) => void;
}) => {
  const [searchUserFilter, setSearchUserFilter] = useState("");
  const [adminsOnly, setAdminsOnly] = useState(false);
  const { user } = useUser();
  const userId = user?.id || "";
  const [debounedSearchTerm] = useDebounce(searchUserFilter, 500);
  const { subscription } = useSubscription();

  const { data, isPending, isFetchingNextPage, hasNextPage, fetchNextPage } = useAdminGetUsers({
    limit: 20,
    searchTerm: debounedSearchTerm,
    adminsOnly
  });

  const isEmpty = !isPending && !data?.pages?.[0].length;
  const isTableFiltered = Boolean(adminsOnly);

  return (
    <>
      <div className="flex gap-2">
        <Input
          value={searchUserFilter}
          onChange={(e) => setSearchUserFilter(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search users..."
          className="flex-1"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              ariaLabel="Filter Users"
              variant="plain"
              size="sm"
              className={twMerge(
                "flex h-10 w-11 items-center justify-center overflow-hidden border border-mineshaft-600 bg-mineshaft-800 p-0 transition-all hover:border-primary/60 hover:bg-primary/10",
                isTableFiltered && "border-primary/50 text-primary"
              )}
            >
              <FontAwesomeIcon icon={faFilter} />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Filter Users</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={(e) => {
                e.preventDefault();
                setAdminsOnly(!adminsOnly);
              }}
              icon={adminsOnly && <FontAwesomeIcon className="text-primary" icon={faCheckCircle} />}
              iconPos="right"
            >
              <div className="flex w-full items-center justify-between">
                <span>Admins Only</span>
                <Switch
                  id="admins-only"
                  isChecked={adminsOnly}
                  onCheckedChange={(checked) => setAdminsOnly(checked)}
                  className="data-[state=checked]:bg-primary-400"
                />
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
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
                                        handlePopUpOpen("upgradePlan", {
                                          username,
                                          id,
                                          message: deleteUserUpgradePlanMessage
                                        });
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
                                          handlePopUpOpen("upgradePlan", {
                                            username,
                                            id,
                                            message: addServerAdminUpgradePlanMessage
                                          });
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
        text={`${popUp?.upgradePlan?.data?.message} is only available on Infisical's Pro plan and above.`}
      />
    </div>
  );
};
