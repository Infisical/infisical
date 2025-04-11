import {
  faDownload,
  faEllipsis,
  faPencil,
  faServer,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import FileSaver from "file-saver";
import { twMerge } from "tailwind-merge";

import { createNotification } from "@app/components/notifications";
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
import { fetchSshHostUserCaPublicKey, useListWorkspaceSshHosts } from "@app/hooks/api";
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
        <Table>
          <THead>
            <Tr>
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
                    <Td>{host.hostname}</Td>
                    <Td>
                      {host.loginMappings.length === 0 ? (
                        <span className="italic text-mineshaft-400">None</span>
                      ) : (
                        host.loginMappings.map(({ loginUser, allowedPrincipals }) => (
                          <div key={`${host.id}-${loginUser}`} className="mb-2">
                            <div className="text-mineshaft-200">{loginUser}</div>
                            {allowedPrincipals.usernames.map((username) => (
                              <div key={`${host.id}-${loginUser}-${username}`} className="ml-4">
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
                            I={ProjectPermissionActions.Edit}
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
                                Edit SSH host
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Delete}
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
                                Delete SSH host
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
