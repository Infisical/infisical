import { useState } from "react";
import { faEllipsis, faMagnifyingGlass, faServer } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import {
  Badge,
  Button,
  DeleteActionModal,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
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
import { useDebounce, usePopUp } from "@app/hooks";
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

  const { data, isPending, isFetchingNextPage, hasNextPage, fetchNextPage } = useAdminGetIdentities(
    {
      limit: 20,
      searchTerm: debouncedSearchTerm
    }
  );

  const isEmpty = !isPending && !data?.pages?.[0].length;

  return (
    <>
      <div className="flex gap-2">
        <Input
          value={searchIdentityFilter}
          onChange={(e) => setSearchIdentityFilter(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search identities by name..."
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
                data?.pages?.map((identities) =>
                  identities.map(({ name, id, isInstanceAdmin }) => (
                    <Tr key={`identity-${id}`} className="w-full">
                      <Td>
                        {name}
                        {isInstanceAdmin && (
                          <Badge variant="primary" className="ml-2">
                            Server Admin
                          </Badge>
                        )}
                      </Td>
                      <Td>
                        {isInstanceAdmin && (
                          <div className="flex justify-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild className="rounded-lg">
                                <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                                  <FontAwesomeIcon size="sm" icon={faEllipsis} />
                                </div>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="start" className="p-1">
                                {isInstanceAdmin && (
                                  <DropdownMenuItem
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePopUpOpen("removeServerAdmin", { name, id });
                                    }}
                                  >
                                    Remove Server Admin
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}
                      </Td>
                    </Tr>
                  ))
                )}
            </TBody>
          </Table>
          {!isPending && isEmpty && <EmptyState title="No identities found" icon={faServer} />}
        </TableContainer>
        {!isEmpty && (
          <Button
            className="mt-4 py-3 text-sm"
            isFullWidth
            variant="outline_bg"
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

export const MachineIdentitiesTable = () => {
  const { handlePopUpToggle, popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "removeServerAdmin"
  ] as const);

  const { mutate: deleteIdentitySuperAdminAccess } = useAdminRemoveIdentitySuperAdminAccess();

  const handleRemoveServerAdmin = async () => {
    const { id } = popUp?.removeServerAdmin?.data as { id: string; name: string };

    try {
      await deleteIdentitySuperAdminAccess(id);
      createNotification({
        type: "success",
        text: "Successfully removed server admin permissions"
      });
    } catch {
      createNotification({
        type: "error",
        text: "Error removing server admin permissions"
      });
    }

    handlePopUpClose("removeServerAdmin");
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
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
