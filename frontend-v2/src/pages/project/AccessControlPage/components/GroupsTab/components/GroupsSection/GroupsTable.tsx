import { useMemo } from "react";
import {
  faArrowDown,
  faArrowUp,
  faMagnifyingGlass,
  faSearch,
  faTrash,
  faUsers
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
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
  Tooltip,
  Tr
} from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { useListWorkspaceGroups } from "@app/hooks/api";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { GroupRoles } from "./GroupRoles";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteGroup", "group"]>,
    data?: {
      id?: string;
      name?: string;
    }
  ) => void;
};

enum GroupsOrderBy {
  Name = "name"
}

export const GroupTable = ({ handlePopUpOpen }: Props) => {
  const { currentWorkspace } = useWorkspace();

  const {
    search,
    setSearch,
    setPage,
    page,
    perPage,
    setPerPage,
    offset,
    orderDirection,
    orderBy,
    toggleOrderDirection
  } = usePagination(GroupsOrderBy.Name, { initPerPage: 20 });

  const { data: groupMemberships = [], isPending } = useListWorkspaceGroups(
    currentWorkspace?.id || ""
  );

  const filteredGroupMemberships = useMemo(() => {
    const filtered = search
      ? groupMemberships?.filter(
          ({ group: { name, slug } }) =>
            name.toLowerCase().includes(search.toLowerCase()) ||
            slug.toLowerCase().includes(search.toLowerCase())
        )
      : groupMemberships;

    const ordered = filtered?.sort((a, b) =>
      a.group.name.toLowerCase().localeCompare(b.group.name.toLowerCase())
    );

    return orderDirection === OrderByDirection.ASC ? ordered : ordered?.reverse();
  }, [search, groupMemberships, orderBy, orderDirection]);

  useResetPageHelper({
    totalCount: filteredGroupMemberships.length,
    offset,
    setPage
  });

  return (
    <div>
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
        placeholder="Search members..."
      />
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th className="w-1/3">
                <div className="flex items-center">
                  Name
                  <IconButton
                    variant="plain"
                    className="ml-2"
                    ariaLabel="sort"
                    onClick={toggleOrderDirection}
                  >
                    <FontAwesomeIcon
                      icon={orderDirection === OrderByDirection.DESC ? faArrowUp : faArrowDown}
                    />
                  </IconButton>
                </div>
              </Th>
              <Th>Role</Th>
              <Th>Added on</Th>
              <Th className="w-5" />
            </Tr>
          </THead>
          <TBody>
            {isPending && <TableSkeleton columns={4} innerKey="project-groups" />}
            {!isPending &&
              filteredGroupMemberships &&
              filteredGroupMemberships.length > 0 &&
              filteredGroupMemberships
                .slice(offset, perPage * page)
                .map(({ group: { id, name }, roles, createdAt }) => {
                  return (
                    <Tr className="group h-10" key={`st-v3-${id}`}>
                      <Td>{name}</Td>
                      <Td>
                        <ProjectPermissionCan
                          I={ProjectPermissionActions.Edit}
                          a={ProjectPermissionSub.Groups}
                        >
                          {(isAllowed) => (
                            <GroupRoles roles={roles} disableEdit={!isAllowed} groupId={id} />
                          )}
                        </ProjectPermissionCan>
                      </Td>
                      <Td>{format(new Date(createdAt), "yyyy-MM-dd")}</Td>
                      <Td className="flex justify-end">
                        <ProjectPermissionCan
                          I={ProjectPermissionActions.Delete}
                          a={ProjectPermissionSub.Groups}
                        >
                          {(isAllowed) => (
                            <div className="opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                              <Tooltip content="Remove">
                                <IconButton
                                  onClick={() => {
                                    handlePopUpOpen("deleteGroup", {
                                      id,
                                      name
                                    });
                                  }}
                                  colorSchema="danger"
                                  variant="plain"
                                  ariaLabel="update"
                                  className="ml-4"
                                  isDisabled={!isAllowed}
                                >
                                  <FontAwesomeIcon icon={faTrash} />
                                </IconButton>
                              </Tooltip>
                            </div>
                          )}
                        </ProjectPermissionCan>
                      </Td>
                    </Tr>
                  );
                })}
          </TBody>
        </Table>
        {Boolean(filteredGroupMemberships.length) && (
          <Pagination
            count={filteredGroupMemberships.length}
            page={page}
            perPage={perPage}
            onChangePage={setPage}
            onChangePerPage={setPerPage}
          />
        )}
        {!isPending && !filteredGroupMemberships?.length && (
          <EmptyState
            title={
              groupMemberships.length
                ? "No project groups match search..."
                : "No project groups found"
            }
            icon={groupMemberships.length ? faSearch : faUsers}
          />
        )}
      </TableContainer>
    </div>
  );
};
