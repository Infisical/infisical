import { useMemo, useState } from "react";
import { faMagnifyingGlass, faUsers } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";

import {
  EmptyState,
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
import { useWorkspace } from "@app/context";
import { getProjectBaseURL } from "@app/helpers/project";
import { usePagination, useResetPageHelper } from "@app/hooks";
import { useListProjectIdentityGroupIdentities } from "@app/hooks/api";
import { TIdentityGroupMembership } from "@app/hooks/api/identity-groups/types";

type Props = {
  identityGroupMembership: TIdentityGroupMembership;
};

export const IdentityGroupIdentitiesSection = ({ identityGroupMembership }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { page, setPage, perPage, setPerPage, offset } = usePagination(
    "project-identity-group-identities",
    { initPerPage: 20 }
  );

  const { data, isPending } = useListProjectIdentityGroupIdentities({
    id: identityGroupMembership.group.id,
    projectId: currentWorkspace.id,
    identityGroupSlug: identityGroupMembership.group.slug,
    offset,
    limit: perPage,
    search
  });
  console.log("data", data);

  const filteredIdentities = useMemo(() => {
    if (!data?.identities) return [];

    return search
      ? data.identities.filter((identity) =>
          identity.name.toLowerCase().includes(search.toLowerCase())
        )
      : data.identities;
  }, [data?.identities, search]);

  console.log("filteredIdentities", filteredIdentities);
  useResetPageHelper({
    totalCount: filteredIdentities.length,
    offset,
    setPage
  });

  return (
    <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
        <h3 className="text-lg font-semibold text-mineshaft-100">
          Identity Group Members ({data?.totalCount || 0})
        </h3>
      </div>
      <div className="py-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
          placeholder="Search identities..."
          className="mb-4"
        />
        <TableContainer>
          <Table>
            <THead>
              <Tr>
                <Th>Name</Th>
                <Th>Auth Method</Th>
                <Th>Added On</Th>
              </Tr>
            </THead>
            <TBody>
              {isPending && (
                <TableSkeleton columns={3} innerKey="project-identity-group-identities" />
              )}
              {!isPending &&
                filteredIdentities &&
                filteredIdentities.length > 0 &&
                filteredIdentities.slice(offset, perPage * page).map((identity) => {
                  return (
                    <Tr
                      className="group h-10 w-full cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
                      key={`identity-${identity.id}`}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(evt) => {
                        if (evt.key === "Enter") {
                          navigate({
                            to: `${getProjectBaseURL(currentWorkspace.type)}/identities/$identityId` as const,
                            params: {
                              projectId: currentWorkspace.id,
                              identityId: identity.id
                            }
                          });
                        }
                      }}
                      onClick={() =>
                        navigate({
                          to: `${getProjectBaseURL(currentWorkspace.type)}/identities/$identityId` as const,
                          params: {
                            projectId: currentWorkspace.id,
                            identityId: identity.id
                          }
                        })
                      }
                    >
                      <Td>{identity.name}</Td>
                      <Td className="capitalize">{identity.authMethod || "N/A"}</Td>
                      <Td>{new Date(identity.joinedGroupAt).toLocaleDateString()}</Td>
                    </Tr>
                  );
                })}
            </TBody>
          </Table>
          {Boolean(filteredIdentities.length) && (
            <Pagination
              count={filteredIdentities.length}
              page={page}
              perPage={perPage}
              onChangePage={setPage}
              onChangePerPage={setPerPage}
            />
          )}
          {!isPending && !filteredIdentities?.length && (
            <EmptyState
              title={
                data?.identities?.length
                  ? "No identities match search..."
                  : "No identities in this identity group"
              }
              icon={faUsers}
            />
          )}
        </TableContainer>
      </div>
    </div>
  );
};
