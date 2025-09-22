import { useState } from "react";
import { faMagnifyingGlass, faUsers } from "@fortawesome/free-solid-svg-icons";
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
import { OrgPermissionGroupActions, OrgPermissionSubjects } from "@app/context";
import { useDebounce, useResetPageHelper } from "@app/hooks";
import { useAddIdentityToGroup, useListGroupIdentities } from "@app/hooks/api";
import { EFilterReturnedIdentities } from "@app/hooks/api/groups/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  popUp: UsePopUpState<["addGroupMembers"]>;
  handlePopUpToggle: (popUpName: keyof UsePopUpState<["addGroupMembers"]>, state?: boolean) => void;
};

export const AddGroupIdentitiesModal = ({ popUp, handlePopUpToggle }: Props) => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [searchMemberFilter, setSearchMemberFilter] = useState("");
  const [debouncedSearch] = useDebounce(searchMemberFilter);

  const popUpData = popUp?.addGroupMembers?.data as {
    groupId: string;
    slug: string;
  };

  const offset = (page - 1) * perPage;
  const { data, isPending } = useListGroupIdentities({
    id: popUpData?.groupId,
    groupSlug: popUpData?.slug,
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
        groupId: popUpData.groupId,
        identityId,
        slug: popUpData.slug
      });

      createNotification({
        text: "Successfully assigned identity to the group",
        type: "success"
      });
    } catch {
      createNotification({
        text: "Failed to assign identity to the group",
        type: "error"
      });
    }
  };

  return (
    <Modal
      isOpen={popUp?.addGroupMembers?.isOpen}
      onOpenChange={(isOpen) => {
        handlePopUpToggle("addGroupMembers", isOpen);
      }}
    >
      <ModalContent title="Add Identities">
        <Input
          value={searchMemberFilter}
          onChange={(e) => setSearchMemberFilter(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search identities..."
        />
        <TableContainer className="mt-4">
          <Table>
            <THead>
              <Tr>
                <Th>Identity</Th>
                <Th />
              </Tr>
            </THead>
            <TBody>
              {isPending && <TableSkeleton columns={2} innerKey="group-identities" />}
              {!isPending &&
                data?.identities?.map(({ id, name }) => {
                  return (
                    <Tr className="items-center" key={`group-identity-${id}`}>
                      <Td>
                        <p>{name}</p>
                      </Td>
                      <Td className="flex justify-end">
                        <OrgPermissionCan
                          I={OrgPermissionGroupActions.Edit}
                          a={OrgPermissionSubjects.Groups}
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
                                Assign
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
              icon={faUsers}
            />
          )}
        </TableContainer>
      </ModalContent>
    </Modal>
  );
};
