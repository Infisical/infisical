import { faBan, faCertificate, faEllipsis, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useNavigate } from "@tanstack/react-router";
import { format } from "date-fns";
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
import { CaStatus, CaType, useListCasByTypeAndProjectId } from "@app/hooks/api";
import {
  caStatusToNameMap,
  caTypeToNameMap,
  getCaStatusBadgeVariant
} from "@app/hooks/api/ca/constants";
import { TInternalCertificateAuthority } from "@app/hooks/api/ca/types";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["installCaCert", "caCert", "ca", "deleteCa", "caStatus"]>,
    data?: {
      caId?: string;
      caName?: string;
      dn?: string;
      status?: CaStatus;
    }
  ) => void;
};

export const CaTable = ({ handlePopUpOpen }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { data, isPending } = useListCasByTypeAndProjectId(CaType.INTERNAL, currentProject.id);
  const cas = data as TInternalCertificateAuthority[];

  return (
    <div>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>Name</Th>
              <Th>Status</Th>
              <Th>Type</Th>
              <Th>Valid Until</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {isPending && <TableSkeleton columns={3} innerKey="project-cas" />}
            {!isPending &&
              cas &&
              cas.length > 0 &&
              cas.map((ca) => {
                return (
                  <Tr
                    className="h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
                    key={`ca-${ca.id}`}
                    onClick={() =>
                      navigate({
                        to: "/organizations/$orgId/projects/cert-management/$projectId/ca/$caId",
                        params: {
                          orgId: currentOrg.id,
                          projectId: currentProject.id,
                          caId: ca.id
                        }
                      })
                    }
                  >
                    <Td>{ca.name}</Td>
                    <Td>
                      <Badge variant={getCaStatusBadgeVariant(ca.status)}>
                        {caStatusToNameMap[ca.status]}
                      </Badge>
                    </Td>
                    <Td>{caTypeToNameMap[ca.configuration.type]}</Td>
                    <Td>
                      <div className="flex items-center">
                        <p>
                          {ca.configuration.notAfter
                            ? format(new Date(ca.configuration.notAfter), "yyyy-MM-dd")
                            : "-"}
                        </p>
                      </div>
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
                          {ca.status === CaStatus.PENDING_CERTIFICATE && (
                            <ProjectPermissionCan
                              I={ProjectPermissionActions.Create}
                              a={ProjectPermissionSub.CertificateAuthorities}
                            >
                              {(isAllowed) => (
                                <DropdownMenuItem
                                  className={twMerge(
                                    !isAllowed &&
                                      "pointer-events-none cursor-not-allowed opacity-50"
                                  )}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePopUpOpen("installCaCert", {
                                      caId: ca.id
                                    });
                                  }}
                                  disabled={!isAllowed}
                                  icon={<FontAwesomeIcon icon={faCertificate} />}
                                >
                                  Install CA Certificate
                                </DropdownMenuItem>
                              )}
                            </ProjectPermissionCan>
                          )}
                          {ca.status !== CaStatus.PENDING_CERTIFICATE && (
                            <ProjectPermissionCan
                              I={ProjectPermissionActions.Read}
                              a={ProjectPermissionSub.CertificateAuthorities}
                            >
                              {(isAllowed) => (
                                <DropdownMenuItem
                                  className={twMerge(
                                    !isAllowed &&
                                      "pointer-events-none cursor-not-allowed opacity-50"
                                  )}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePopUpOpen("caCert", {
                                      caId: ca.id
                                    });
                                  }}
                                  disabled={!isAllowed}
                                  icon={<FontAwesomeIcon icon={faCertificate} />}
                                >
                                  View Certificate
                                </DropdownMenuItem>
                              )}
                            </ProjectPermissionCan>
                          )}
                          {(ca.status === CaStatus.ACTIVE || ca.status === CaStatus.DISABLED) && (
                            <ProjectPermissionCan
                              I={ProjectPermissionActions.Edit}
                              a={ProjectPermissionSub.CertificateAuthorities}
                            >
                              {(isAllowed) => (
                                <DropdownMenuItem
                                  className={twMerge(
                                    !isAllowed &&
                                      "pointer-events-none cursor-not-allowed opacity-50"
                                  )}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePopUpOpen("caStatus", {
                                      caId: ca.id,
                                      status:
                                        ca.status === CaStatus.ACTIVE
                                          ? CaStatus.DISABLED
                                          : CaStatus.ACTIVE
                                    });
                                  }}
                                  disabled={!isAllowed}
                                  icon={<FontAwesomeIcon icon={faBan} />}
                                >
                                  {`${ca.status === CaStatus.ACTIVE ? "Disable" : "Enable"} CA`}
                                </DropdownMenuItem>
                              )}
                            </ProjectPermissionCan>
                          )}
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Delete}
                            a={ProjectPermissionSub.CertificateAuthorities}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("deleteCa", {
                                    caId: ca.id
                                  });
                                }}
                                disabled={!isAllowed}
                                icon={<FontAwesomeIcon icon={faTrash} />}
                              >
                                Delete CA
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
          <EmptyState title="No certificate authorities have been created" icon={faCertificate} />
        )}
      </TableContainer>
    </div>
  );
};
