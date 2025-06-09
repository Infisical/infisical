import {
  faDownload,
  faEllipsis,
  faPencil,
  faServer,
  faTrash,
  faUser,
  faUsers
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import FileSaver from "file-saver";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  Badge,
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
import { ProjectPermissionSshHostActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { fetchSshHostUserCaPublicKey, useListWorkspaceSshHosts } from "@app/hooks/api";
import { LoginMappingSource } from "@app/hooks/api/sshHost/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteSshHost", "sshHost"]>,
    data?: object
  ) => void;
};

export const SshHostsTable = ({ handlePopUpOpen }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const { data, isPending } = useListWorkspaceSshHosts(currentWorkspace?.id || "");

  const downloadTxtFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    FileSaver.saveAs(blob, filename);
  };

  const handleDownloadUserCaKey = async (sshHostId: string) => {
    try {
      const publicKey = await fetchSshHostUserCaPublicKey(sshHostId);
      downloadTxtFile("infisical_user_ca.pub", publicKey);
    } catch (err) {
      console.error("Failed to download User CA public key", err);
      createNotification({
        type: "error",
        text: "Failed to download User CA public key"
      });
    }
  };

  return (
    <div>
      <TableContainer>
        <Table className="w-full table-fixed">
          <THead>
            <Tr>
              <Th>Alias</Th>
              <Th>Hostname</Th>
              <Th>Login User - Authorized Principals Mapping</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {isPending && <TableSkeleton columns={3} innerKey="org-ssh-cas" />}
            {!isPending &&
              data &&
              data.length > 0 &&
              data.map((host) => {
                return (
                  <Tr
                    // className="h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
                    className="h-10"
                    key={`ssh-host-${host.id}`}
                  >
                    <Td>{host.alias ?? "-"}</Td>
                    <Td>{host.hostname}</Td>
                    <Td>
                      {host.loginMappings.length === 0 ? (
                        <span className="italic text-mineshaft-400">None</span>
                      ) : (
                        (() => {
                          const hostMappings = host.loginMappings.filter(
                            (m) => m.source !== LoginMappingSource.HOST_GROUP
                          );
                          const groupMappings = host.loginMappings.filter(
                            (m) => m.source === LoginMappingSource.HOST_GROUP
                          );

                          const hostLoginUserToPrincipals = hostMappings.reduce(
                            (acc, { loginUser, allowedPrincipals }) => {
                              acc[loginUser] = {
                                users: new Set(allowedPrincipals.usernames),
                                groups: new Set(allowedPrincipals.groups)
                              };
                              return acc;
                            },
                            {} as Record<string, { users: Set<string>; groups: Set<string> }>
                          );

                          const entriesFromHost = hostMappings.map(
                            ({ loginUser, allowedPrincipals }) => ({
                              loginUser,
                              source: LoginMappingSource.HOST,
                              users: allowedPrincipals.usernames,
                              groups: allowedPrincipals.groups
                            })
                          );

                          const entriesFromGroup = groupMappings
                            .map(({ loginUser, allowedPrincipals }) => {
                              const existing = hostLoginUserToPrincipals[loginUser] || {};
                              const filteredUsernames = allowedPrincipals.usernames?.filter(
                                (u) => !existing.users?.has(u)
                              );
                              const filteredGroups = allowedPrincipals.groups?.filter(
                                (g) => !existing.groups?.has(g)
                              );
                              return ((filteredGroups?.length || filteredUsernames?.length) ?? 0) >
                                0
                                ? {
                                    loginUser,
                                    source: LoginMappingSource.HOST_GROUP,
                                    users: filteredUsernames,
                                    groups: filteredGroups
                                  }
                                : null;
                            })
                            .filter(Boolean) as {
                            loginUser: string;
                            source: LoginMappingSource;
                            users: string[];
                            groups: string[];
                          }[];

                          return [...entriesFromHost, ...entriesFromGroup]
                            .sort((a, b) => a.loginUser.localeCompare(b.loginUser))
                            .map(({ loginUser, users, groups, source }) => (
                              <div key={`${host.id}-${loginUser}-${source}`} className="mb-2">
                                <div className="text-mineshaft-200">
                                  {loginUser}
                                  {source === LoginMappingSource.HOST_GROUP && (
                                    <span className="ml-2 text-xs text-mineshaft-400">
                                      (inherited from host group)
                                    </span>
                                  )}
                                </div>
                                {users?.map((username) => (
                                  <div
                                    key={`${host.id}-${loginUser}-${source}-${username}`}
                                    className="flex items-center gap-2"
                                  >
                                    <div className="flex items-center">
                                      <span className="text-gray-400">└─</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <FontAwesomeIcon
                                        icon={faUser}
                                        className="text-xs text-yellow/80"
                                      />
                                      <span>{username}</span>
                                      <Badge variant="primary">user</Badge>
                                    </div>
                                  </div>
                                ))}
                                {groups?.map((group) => (
                                  <div
                                    key={`${host.id}-${loginUser}-${source}-${group}`}
                                    className="flex items-center gap-2"
                                  >
                                    <div className="flex items-center">
                                      <span className="text-gray-400">└─</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <FontAwesomeIcon
                                        icon={faUsers}
                                        className="text-xs text-green/80"
                                      />
                                      <span>{group}</span>
                                      <Badge variant="success">group</Badge>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ));
                        })()
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
                          <DropdownMenuItem
                            onClick={async (e) => {
                              e.stopPropagation();
                              handleDownloadUserCaKey(host.id);
                            }}
                            icon={<FontAwesomeIcon icon={faDownload} />}
                          >
                            Download User CA Public Key
                          </DropdownMenuItem>
                          <ProjectPermissionCan
                            I={ProjectPermissionSshHostActions.Edit}
                            a={ProjectPermissionSub.SshHosts}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("sshHost", {
                                    sshHostId: host.id
                                  });
                                }}
                                disabled={!isAllowed}
                                icon={<FontAwesomeIcon icon={faPencil} />}
                              >
                                Edit Host
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                          <ProjectPermissionCan
                            I={ProjectPermissionSshHostActions.Delete}
                            a={ProjectPermissionSub.SshHosts}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("deleteSshHost", {
                                    sshHostId: host.id
                                  });
                                }}
                                disabled={!isAllowed}
                                icon={<FontAwesomeIcon icon={faTrash} />}
                              >
                                Delete Host
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
          <EmptyState title="No SSH hosts have been added" icon={faServer} />
        )}
      </TableContainer>
    </div>
  );
};
