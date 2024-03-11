import { faServer, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  EmptyState,
  IconButton,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { useGetWorkspaceIdentityMemberships } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { IdentityRoles } from "./IdentityRoles";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteIdentity", "identity"]>,
    data?: {
      identityId?: string;
      name?: string;
    }
  ) => void;
};

export const IdentityTable = ({ handlePopUpOpen }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const { data, isLoading } = useGetWorkspaceIdentityMemberships(currentWorkspace?.id || "");

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Name</Th>
            <Th>Role</Th>
            <Th>Added on</Th>
            <Th className="w-5" />
          </Tr>
        </THead>
        <TBody>
          {isLoading && <TableSkeleton columns={7} innerKey="project-identities" />}
          {!isLoading &&
            data &&
            data.length > 0 &&
            data.map(({ identity: { id, name }, roles, createdAt }) => {
              return (
                <Tr className="h-10" key={`st-v3-${id}`}>
                  <Td>{name}</Td>
                  <Td>
                    <ProjectPermissionCan
                      I={ProjectPermissionActions.Edit}
                      a={ProjectPermissionSub.Identity}
                    >
                      {(isAllowed) => (
                        <IdentityRoles roles={roles} disableEdit={!isAllowed} identityId={id} />
                      )}
                    </ProjectPermissionCan>
                  </Td>
                  <Td>{format(new Date(createdAt), "yyyy-MM-dd")}</Td>
                  <Td className="flex justify-end">
                    <ProjectPermissionCan
                      I={ProjectPermissionActions.Delete}
                      a={ProjectPermissionSub.Identity}
                    >
                      {(isAllowed) => (
                        <IconButton
                          onClick={() => {
                            handlePopUpOpen("deleteIdentity", {
                              identityId: id,
                              name
                            });
                          }}
                          size="lg"
                          colorSchema="danger"
                          variant="plain"
                          ariaLabel="update"
                          className="ml-4"
                          isDisabled={!isAllowed}
                        >
                          <FontAwesomeIcon icon={faXmark} />
                        </IconButton>
                      )}
                    </ProjectPermissionCan>
                  </Td>
                </Tr>
              );
            })}
          {!isLoading && data && data?.length === 0 && (
            <Tr>
              <Td colSpan={7}>
                <EmptyState title="No identities have been added to this project" icon={faServer} />
              </Td>
            </Tr>
          )}
        </TBody>
      </Table>
    </TableContainer>
  );
};
