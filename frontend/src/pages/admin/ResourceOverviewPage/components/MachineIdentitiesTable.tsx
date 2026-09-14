import { useState } from "react";
import {
  EllipsisVerticalIcon,
  SearchIcon,
  ServerCogIcon,
  ShieldXIcon,
  WrenchIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Pagination
} from "@app/components/v3";
import {
  getUserTablePreference,
  PreferenceKey,
  setUserTablePreference
} from "@app/helpers/userTablePreferences";
import { useDebounce, usePagination, usePopUp, useResetPageHelper } from "@app/hooks";
import { useAdminRemoveIdentitySuperAdminAccess } from "@app/hooks/api/admin";
import { useAdminGetIdentities } from "@app/hooks/api/admin/queries";
import { UsePopUpState } from "@app/hooks/usePopUp";
import { AdminDeleteActionDialog } from "@app/pages/admin/components/AdminDeleteActionDialog";
import {
  EmptyState,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/pages/admin/components/AdminTable";

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
        <InputGroup className="flex-1">
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search machine identities"
            value={searchIdentityFilter}
            onChange={(e) => setSearchIdentityFilter(e.target.value)}
            placeholder="Search machine identities by name..."
          />
        </InputGroup>
      </div>
      <div className="mt-4">
        {isEmpty ? (
          <EmptyState className="border" title="No machine identities found" icon={WrenchIcon} />
        ) : (
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
                                <IconButton aria-label="Options" size="xs" variant="ghost">
                                  <EllipsisVerticalIcon />
                                </IconButton>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent sideOffset={2} align="end">
                                <DropdownMenuItem
                                  variant="danger"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePopUpOpen("removeServerAdmin", {
                                      name,
                                      id
                                    });
                                  }}
                                >
                                  <ShieldXIcon />
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
          </TableContainer>
        )}
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

  const { mutateAsync: deleteIdentitySuperAdminAccess } = useAdminRemoveIdentitySuperAdminAccess();

  const handleRemoveServerAdmin = async () => {
    const { id } = popUp?.removeServerAdmin?.data as {
      id: string;
      name: string;
    };

    await deleteIdentitySuperAdminAccess(id);
    createNotification({
      type: "success",
      text: "Server admin access removed"
    });

    handlePopUpClose("removeServerAdmin");
  };

  return (
    <Card className="mb-6 gap-0 overflow-hidden p-0">
      <CardHeader className="p-6">
        <CardTitle>Machine Identities</CardTitle>
        <CardDescription>Manage machine identities across your instance.</CardDescription>
      </CardHeader>
      <CardContent className="px-6 pb-6">
        <IdentityPanelTable handlePopUpOpen={handlePopUpOpen} />
      </CardContent>
      <AdminDeleteActionDialog
        isOpen={popUp.removeServerAdmin.isOpen}
        title={`Remove Server Admin Access from "${
          (popUp?.removeServerAdmin?.data as { name: string })?.name || "machine identity"
        }"`}
        description="This identity will no longer be able to manage the instance."
        onChange={(isOpen) => handlePopUpToggle("removeServerAdmin", isOpen)}
        confirmationKey="confirm"
        onConfirm={handleRemoveServerAdmin}
        confirmButtonText="Remove Access"
      />
    </Card>
  );
};
