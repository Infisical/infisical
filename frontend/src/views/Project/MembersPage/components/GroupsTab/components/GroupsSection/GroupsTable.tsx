import { faServer, faTrash } from "@fortawesome/free-solid-svg-icons";
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
  Tooltip,
  Tr
} from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { useListWorkspaceGroups } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { GroupRoles } from "./GroupRoles";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteGroup", "group"]>,
    data?: {
      slug?: string;
      name?: string;
    }
  ) => void;
};

export const GroupTable = ({ handlePopUpOpen }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const { data, isLoading } = useListWorkspaceGroups(currentWorkspace?.slug || "");
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
          {isLoading && <TableSkeleton columns={4} innerKey="project-groups" />}
          {!isLoading &&
            data &&
            data.length > 0 &&
            data.map(({ group: { id, name, slug }, roles, createdAt }) => {
              return (
                <Tr className="group h-10" key={`st-v3-${id}`}>
                  <Td>{name}</Td>
                  <Td>
                    <ProjectPermissionCan
                      I={ProjectPermissionActions.Edit}
                      a={ProjectPermissionSub.Groups}
                    >
                      {(isAllowed) => (
                        <GroupRoles roles={roles} disableEdit={!isAllowed} groupSlug={slug} />
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
                                  slug,
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
      {!isLoading && data?.length === 0 && (
        <EmptyState title="No groups have been added to this project" icon={faServer} />
      )}
    </TableContainer>
  );
};
