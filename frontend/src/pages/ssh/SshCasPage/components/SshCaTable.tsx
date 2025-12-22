import { faBan, faCertificate, faEllipsis, faTrash } from "@fortawesome/free-solid-svg-icons";
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
import { Badge } from "@app/components/v3";
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useOrganization,
  useProject
} from "@app/context";
import { SshCaStatus, useListWorkspaceSshCas } from "@app/hooks/api";
import { caStatusToNameMap, getCaStatusBadgeVariant } from "@app/hooks/api/ca/constants";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["deleteSshCa", "sshCaStatus"]>,
    data?: object
  ) => void;
};

export const SshCaTable = ({ handlePopUpOpen }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { data, isPending } = useListWorkspaceSshCas(currentProject?.id || "");

  return (
    <div>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>Friendly Name</Th>
              <Th>Status</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {isPending && <TableSkeleton columns={3} innerKey="org-ssh-cas" />}
            {!isPending &&
              data &&
              data.length > 0 &&
              data.map((ca) => {
                return (
                  <Tr
                    className="h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
                    key={`ca-${ca.id}`}
                    onClick={() =>
                      navigate({
                        to: "/organizations/$orgId/projects/ssh/$projectId/ca/$caId",
                        params: {
                          orgId: currentOrg.id,
                          projectId: currentProject.id,
                          caId: ca.id
                        }
                      })
                    }
                  >
                    <Td>{ca.friendlyName}</Td>
                    <Td>
                      <Badge variant={getCaStatusBadgeVariant(ca.status)}>
                        {caStatusToNameMap[ca.status]}
                      </Badge>
                    </Td>
                    <Td className="flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild className="rounded-lg">
                          <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                            <Tooltip content="More options">
                              <FontAwesomeIcon size="lg" icon={faEllipsis} />
                            </Tooltip>
                          </div>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="p-1">
                          {(ca.status === SshCaStatus.ACTIVE ||
                            ca.status === SshCaStatus.DISABLED) && (
                            <ProjectPermissionCan
                              I={ProjectPermissionActions.Edit}
                              a={ProjectPermissionSub.SshCertificateAuthorities}
                            >
                              {(isAllowed) => (
                                <DropdownMenuItem
                                  className={twMerge(
                                    !isAllowed &&
                                      "pointer-events-none cursor-not-allowed opacity-50"
                                  )}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePopUpOpen("sshCaStatus", {
                                      caId: ca.id,
                                      status:
                                        ca.status === SshCaStatus.ACTIVE
                                          ? SshCaStatus.DISABLED
                                          : SshCaStatus.ACTIVE
                                    });
                                  }}
                                  disabled={!isAllowed}
                                  icon={<FontAwesomeIcon icon={faBan} />}
                                >
                                  {`${
                                    ca.status === SshCaStatus.ACTIVE ? "Disable" : "Enable"
                                  } SSH CA`}
                                </DropdownMenuItem>
                              )}
                            </ProjectPermissionCan>
                          )}
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Delete}
                            a={ProjectPermissionSub.SshCertificateAuthorities}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("deleteSshCa", {
                                    caId: ca.id
                                  });
                                }}
                                disabled={!isAllowed}
                                icon={<FontAwesomeIcon icon={faTrash} />}
                              >
                                Delete SSH CA
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
          <EmptyState
            title="No SSH certificate authorities have been created"
            icon={faCertificate}
          />
        )}
      </TableContainer>
    </div>
  );
};
