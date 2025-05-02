import { faEllipsis, faPencil, faServer, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { twMerge } from "tailwind-merge";

import { ProjectPermissionCan } from "@app/components/permissions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
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
import { useListWorkspaceSshHostGroups } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/workspace/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteSshHostGroup", "sshHostGroup"]>,
    data?: object
  ) => void;
};

export const SshHostGroupsTable = ({ handlePopUpOpen }: Props) => {
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const { data, isPending } = useListWorkspaceSshHostGroups(currentWorkspace?.id || "");
  return (
    <div>
      <TableContainer>
        <Table className="w-full table-fixed">
          <THead>
            <Tr>
              <Th>Name</Th>
              <Th># Hosts in Group</Th>
              <Th>Login User - Authorized Principals Mapping</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {isPending && <TableSkeleton columns={3} innerKey="org-ssh-cas" />}
            {!isPending &&
              data &&
              data.length > 0 &&
              data.map((group) => {
                return (
                  <Tr
                    className="h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
                    key={`ssh-host-group-${group.id}`}
                    onClick={() =>
                      navigate({
                        to: `/${ProjectType.SSH}/$projectId/ssh-host-groups/$sshHostGroupId` as const,
                        params: {
                          projectId: currentWorkspace.id,
                          sshHostGroupId: group.id
                        }
                      })
                    }
                  >
                    <Td>{group.name}</Td>
                    <Td>{group.hostCount}</Td>
                    <Td>
                      {group.loginMappings.length === 0 ? (
                        <span className="italic text-mineshaft-400">None</span>
                      ) : (
                        group.loginMappings.map(({ loginUser, allowedPrincipals }) => (
                          <div key={`${group.id}-${loginUser}`} className="mb-2">
                            <div className="text-mineshaft-200">{loginUser}</div>
                            {allowedPrincipals.usernames.map((username) => (
                              <div key={`${group.id}-${loginUser}-${username}`} className="ml-4">
                                └─ {username}
                              </div>
                            ))}
                          </div>
                        ))
                      )}
                    </Td>
                    <Td className="text-right align-middle">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild className="rounded-lg">
                          <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                            <Tooltip content="More options">
                              <FontAwesomeIcon size="lg" icon={faEllipsis} />
                            </Tooltip>
                          </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="p-1">
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Edit}
                            a={ProjectPermissionSub.SshHostGroups}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("sshHostGroup", {
                                    sshHostGroupId: group.id
                                  });
                                }}
                                disabled={!isAllowed}
                                icon={<FontAwesomeIcon icon={faPencil} />}
                              >
                                Edit Host Group
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Edit}
                            a={ProjectPermissionSub.SshHostGroups}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate({
                                    to: `/${ProjectType.SSH}/$projectId/ssh-host-groups/$sshHostGroupId` as const,
                                    params: {
                                      projectId: currentWorkspace.id,
                                      sshHostGroupId: group.id
                                    }
                                  });
                                }}
                                disabled={!isAllowed}
                                icon={<FontAwesomeIcon icon={faServer} />}
                              >
                                Manage Hosts
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Delete}
                            a={ProjectPermissionSub.SshHostGroups}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("deleteSshHostGroup", {
                                    sshHostGroupId: group.id,
                                    name: group.name
                                  });
                                }}
                                disabled={!isAllowed}
                                icon={<FontAwesomeIcon icon={faTrash} />}
                              >
                                Delete Host Group
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </Td>
                  </Tr>
                );
              })}
          </TBody>
        </Table>
        {!isPending && data?.length === 0 && (
          <EmptyState title="No SSH host groups have been created" icon={faServer} />
        )}
      </TableContainer>
    </div>
  );
};
