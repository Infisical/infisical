import { useState } from "react";
import { faMagnifyingGlass, faRobot } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  EmptyState,
  Input,
  Modal,
  ModalContent,
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
import { OrgPermissionIdentityGroupActions, OrgPermissionSubjects } from "@app/context";
import { useDebounce, useResetPageHelper } from "@app/hooks";
import { useAddIdentityToGroup, useListIdentityGroupIdentities } from "@app/hooks/api";
import { EFilterReturnedIdentities } from "@app/hooks/api/identity-groups/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["addIdentityToGroup"]>;
  handlePopUpToggle: (
    popUpName: keyof UsePopUpState<["addIdentityToGroup"]>,
    state?: boolean
  ) => void;
};

export const AddIdentityToGroupModal = ({ popUp, handlePopUpToggle }: Props) => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [searchIdentityFilter, setSearchIdentityFilter] = useState("");
  const [debouncedSearch] = useDebounce(searchIdentityFilter);

  const popUpData = popUp?.addIdentityToGroup?.data as {
    identityGroupId: string;
    slug: string;
  };

  const offset = (page - 1) * perPage;
  const { data, isPending } = useListIdentityGroupIdentities({
    id: popUpData?.identityGroupId,
    identityGroupSlug: popUpData?.slug,
    offset,
    limit: perPage,
    search: debouncedSearch,
    filter: EFilterReturnedIdentities.NON_MEMBERS
  });

  const { totalCount = 0 } = data ?? {};

  useResetPageHelper({
    totalCount,
    offset,
    setPage
  });

  const { mutateAsync: addIdentityToGroupMutateAsync } = useAddIdentityToGroup();

  const handleAddIdentity = async (identityId: string) => {
    try {
      if (!popUpData?.slug) {
        createNotification({
          text: "Some data is missing, please refresh the page and try again",
          type: "error"
        });
        return;
      }

      await addIdentityToGroupMutateAsync({
        identityGroupId: popUpData.identityGroupId,
        identityId,
        slug: popUpData.slug
      });

      createNotification({
        text: "Successfully added identity to the group",
        type: "success"
      });
    } catch {
      createNotification({
        text: "Failed to add identity to the group",
        type: "error"
      });
    }
  };

  return (
    <Modal
      isOpen={popUp?.addIdentityToGroup?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("addIdentityToGroup", isOpen);
      }}
    >
      <ModalContent title="Add Identity to Group">
        <Input
          value={searchIdentityFilter}
          onChange={(e) => setSearchIdentityFilter(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search identities..."
        />
        <TableContainer className="mt-4">
          <Table>
            <THead>
              <Tr>
                <Th>Identity</Th>
                <Th>Auth Method</Th>
                <Th />
              </Tr>
            </THead>
            <TBody>
              {isPending && <TableSkeleton columns={3} innerKey="identity-group-identities" />}
              {!isPending &&
                data?.identities?.map(({ id, name, authMethod }) => {
                  return (
                    <Tr className="items-center" key={`identity-group-identity-${id}`}>
                      <Td>
                        <p>{name}</p>
                      </Td>
                      <Td>
                        <p>{authMethod || "N/A"}</p>
                      </Td>
                      <Td className="flex justify-end">
                        <OrgPermissionCan
                          I={OrgPermissionIdentityGroupActions.Edit}
                          a={OrgPermissionSubjects.IdentityGroups}
                        >
                          {(isAllowed) => {
                            return (
                              <Button
                                isLoading={isPending}
                                isDisabled={!isAllowed}
                                colorSchema="primary"
                                variant="outline_bg"
                                type="submit"
                                onClick={() => handleAddIdentity(id)}
                              >
                                Add
                              </Button>
                            );
                          }}
                        </OrgPermissionCan>
                      </Td>
                    </Tr>
                  );
                })}
            </TBody>
          </Table>
          {!isPending && totalCount > 0 && (
            <Pagination
              count={totalCount}
              page={page}
              perPage={perPage}
              onChangePage={(newPage) => setPage(newPage)}
              onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
            />
          )}
          {!isPending && !data?.identities?.length && (
            <EmptyState
              title={
                debouncedSearch
                  ? "No identities match search"
                  : "All identities are already in the group"
              }
              icon={faRobot}
            />
          )}
        </TableContainer>
      </ModalContent>
    </Modal>
  );
};
