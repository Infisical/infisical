import { subject } from "@casl/ability";
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
  Tooltip
} from "@app/components/v2";
import {
  Badge,
  Empty,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
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
  const { permission } = useProjectPermission();
  const { data, isPending } = useListCasByTypeAndProjectId(CaType.INTERNAL);
  const cas = data as TInternalCertificateAuthority[];

  if (isPending) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!cas || cas.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No existing internal certificate authorities</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Valid Until</TableHead>
          <TableHead className="w-5" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {cas.map((ca) => {
          const canReadCa = permission.can(
            ProjectPermissionCertificateAuthorityActions.Read,
            subject(ProjectPermissionSub.CertificateAuthorities, {
              name: ca.name
            })
          );

          return (
            <TableRow
              className={twMerge(!canReadCa && "cursor-not-allowed opacity-60")}
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
              <TableCell>{ca.name}</TableCell>
              <TableCell>
                <Badge variant={getCaStatusBadgeVariant(ca.status)}>
                  {caStatusToNameMap[ca.status]}
                </Badge>
              </TableCell>
              <TableCell>{caTypeToNameMap[ca.configuration.type]}</TableCell>
              <TableCell>
                <div className="flex items-center">
                  <p>
                    {ca.configuration.notAfter
                      ? format(new Date(ca.configuration.notAfter), "yyyy-MM-dd")
                      : "-"}
                  </p>
                </div>
              </TableCell>
              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild className="rounded-lg">
                    <div className="inline-flex hover:text-primary-400 data-[state=open]:text-primary-400">
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
                              !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
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
                              !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
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
                              !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
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
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};
