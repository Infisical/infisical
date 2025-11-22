import {
  faEllipsisV,
  faMagnifyingGlass,
  faShieldHalved,
  faWrench,
  faXmark
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ServerCogIcon } from "lucide-react";
import { useState } from "react";

import { createNotification } from "@app/components/notifications";
import {
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Input,
  Pagination,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { Badge } from "@app/components/v3";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useDebounce, usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import { useAdminRemoveIdentitySuperAdminAccess } from "@app/hooks/api/admin";
import { useAdminGetIdentities } from "@app/hooks/api/admin/queries";
import { UsePopUpState } from "@app/hooks/usePopUp";

const IdentityPanelTable = ({
  handlePopUpOpen
}: {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["removeServerAdmin"]>,
    data?: {
      name: string;
      id: string;
    }
  ) => void;
}) => {
  const [searchIdentityFilter, setSearchIdentityFilter] = useState("");
  const [debouncedSearchTerm] = useDebounce(searchIdentityFilter, 500);

  const { offset, limit, setPage, perPage, page, setPerPage } = usePagination("", {
    initPerPage: getUserTablePreference(
      "ResourceOverviewIdentitiesTable",
      PreferenceKey.PerPage,
      10
    )
  });

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setUserTablePreference("ResourceOverviewIdentitiesTable", PreferenceKey.PerPage, newPerPage);
  };

  const { data, isPending } = useAdminGetIdentities({
    limit,
    offset,
    searchTerm: debouncedSearchTerm
  });

  const { identities, totalCount = 0 } = data ?? {};

  const isEmpty = !isPending && !totalCount;

  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

  return (
    <>
      <div className="flex gap-2">
        <Input
          value={searchIdentityFilter}
          onChange={(e) => setSearchIdentityFilter(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search machine identities by name..."
          className="flex-1"
        />
      </div>
      <div className="mt-4">
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th>Name</Th>
                <Th className="w-5" />
              </Tr>
            </THead>
            <TBody>
              {isPending && <TableSkeleton columns={2} innerKey="identities" />}
              {!isPending &&
                identities?.map(({ name, id, isInstanceAdmin }) => (
                  <Tr key={`identity-${id}`} className="w-full">
                    <Td>
                      {name}
                      {isInstanceAdmin && (
                        <Badge variant="info" className="ml-2">
                          <ServerCogIcon />
                          Server Admin
                        </Badge>
                      )}
                    </Td>
                    <Td>
                      {isInstanceAdmin && (
                        <div className="flex justify-end">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <IconButton
                                ariaLabel="Options"
                                colorSchema="secondary"
                                className="w-6"
                                variant="plain"
                              >
                                <FontAwesomeIcon icon={faEllipsisV} />
                              </IconButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent sideOffset={2} align="end">
                              <DropdownMenuItem
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("removeServerAdmin", { name, id });
                                }}
                                icon={
                                  <div className="relative">
                                    <FontAwesomeIcon icon={faShieldHalved} />
                                    <FontAwesomeIcon
                                      className="absolute -right-1 -bottom-[0.01rem]"
                                      size="2xs"
                                      icon={faXmark}
                                    />
                                  </div>
                                }
                              >
                                Remove Server Admin
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                    </Td>
                  </Tr>
                ))}
            </TBody>
          </Table>
          {!isPending && isEmpty && <EmptyState title="No identities found" icon={faWrench} />}
        </TableContainer>
        {!isPending && totalCount > 0 && (
          <Pagination
            count={totalCount}
            page={page}
            perPage={perPage}
            onChangePage={(newPage) => setPage(newPage)}
            onChangePerPage={handlePerPageChange}
          />
        )}
      </div>
    </>
  );
};

export const MachineIdentitiesTable = () => {
  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "removeServerAdmin"
  ] as const);

  const { mutate: deleteIdentitySuperAdminAccess } = useAdminRemoveIdentitySuperAdminAccess();

  const handleRemoveServerAdmin = async () => {
    const { id } = popUp?.removeServerAdmin?.data as { id: string; name: string };

    await deleteIdentitySuperAdminAccess(id);
    createNotification({
      type: "success",
      text: "Successfully removed server admin permissions"
    });

    handlePopUpClose("removeServerAdmin");
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xl font-medium text-mineshaft-100">Machine Identities</p>
          <p className="text-sm text-bunker-300">Manage machine identities across your instance.</p>
        </div>
      </div>
      <IdentityPanelTable handlePopUpOpen={handlePopUpOpen} />
      <DeleteActionModal
        isOpen={popUp.removeServerAdmin.isOpen}
        title={`Are you sure you want to remove Server Admin permissions from ${
          (popUp?.removeServerAdmin?.data as { name: string })?.name || ""
        }?`}
        subTitle=""
        onChange={(isOpen) => handlePopUpToggle("removeServerAdmin", isOpen)}
        deleteKey="confirm"
        onDeleteApproved={handleRemoveServerAdmin}
        buttonText="Remove Access"
      />
    </div>
  );
};
