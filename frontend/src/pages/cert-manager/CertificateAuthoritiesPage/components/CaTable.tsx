import { subject } from "@casl/ability";
import {
  faBan,
  faCertificate,
  faEllipsis,
  faFileSignature,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
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
  ProjectPermissionCertificateAuthorityActions,
  ProjectPermissionSub,
  useOrganization,
  useProject,
  useProjectPermission
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
    popUpName: keyof UsePopUpState<
      ["installCaCert", "caCert", "ca", "deleteCa", "caStatus", "signIntermediate"]
    >,
    data?: {
      caId?: string;
      caName?: string;
      dn?: string;
      status?: CaStatus;
      maxPathLength?: number;
      notAfter?: string;
    }
  ) => void;
};

export const CaTable = ({ handlePopUpOpen }: Props) => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
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
                const canReadCa = permission.can(
                  ProjectPermissionCertificateAuthorityActions.Read,
                  subject(ProjectPermissionSub.CertificateAuthorities, {
                    name: ca.name
                  })
                );

                return (
                  <Tr
                    className={twMerge(
                      "h-10 transition-colors duration-100",
                      canReadCa && "cursor-pointer hover:bg-mineshaft-700",
                      !canReadCa && "cursor-not-allowed opacity-60"
                    )}
                    key={`ca-${ca.id}`}
                    onClick={() =>
                      canReadCa &&
                      navigate({
                        to: "/organizations/$orgId/projects/cert-manager/$projectId/ca/$caId",
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
                              I={ProjectPermissionCertificateAuthorityActions.Create}
                              a={subject(ProjectPermissionSub.CertificateAuthorities, {
                                name: ca.name
                              })}
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
                              I={ProjectPermissionCertificateAuthorityActions.Read}
                              a={subject(ProjectPermissionSub.CertificateAuthorities, {
                                name: ca.name
                              })}
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
                              I={ProjectPermissionCertificateAuthorityActions.Edit}
                              a={subject(ProjectPermissionSub.CertificateAuthorities, {
                                name: ca.name
                              })}
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
                          {ca.status === CaStatus.ACTIVE &&
                            ca.configuration.maxPathLength !== 0 && (
                              <ProjectPermissionCan
                                I={ProjectPermissionCertificateAuthorityActions.SignIntermediate}
                                a={subject(ProjectPermissionSub.CertificateAuthorities, {
                                  name: ca.name
                                })}
                              >
                                {(isAllowed) => (
                                  <DropdownMenuItem
                                    className={twMerge(
                                      !isAllowed &&
                                        "pointer-events-none cursor-not-allowed opacity-50"
                                    )}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePopUpOpen("signIntermediate", {
                                        caId: ca.id,
                                        maxPathLength: ca.configuration.maxPathLength,
                                        notAfter: ca.configuration.notAfter
                                      });
                                    }}
                                    disabled={!isAllowed}
                                    icon={<FontAwesomeIcon icon={faFileSignature} />}
                                  >
                                    Sign Intermediate
                                  </DropdownMenuItem>
                                )}
                              </ProjectPermissionCan>
                            )}
                          <ProjectPermissionCan
                            I={ProjectPermissionCertificateAuthorityActions.Delete}
                            a={subject(ProjectPermissionSub.CertificateAuthorities, {
                              name: ca.name
                            })}
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
