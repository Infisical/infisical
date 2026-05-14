import { subject } from "@casl/ability";
import { faBan, faEllipsis, faPencil, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
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
  useProjectPermission
} from "@app/context";
import { CaStatus, CaType, useListExternalCasByProjectId } from "@app/hooks/api";
import {
  caStatusToNameMap,
  EXTERNAL_CA_TYPE_NAME_MAP,
  getCaStatusBadgeVariant
} from "@app/hooks/api/ca/constants";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["ca", "deleteCa", "caStatus"]>,
    data?: {
      caId?: string;
      name?: string;
      type?: CaType;
      status?: CaStatus;
    }
  ) => void;
};

export const ExternalCaTable = ({ handlePopUpOpen }: Props) => {
  const { permission } = useProjectPermission();
  const { data, isPending } = useListExternalCasByProjectId();

  if (isPending) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No existing external certificate authorities</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-5" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((ca) => {
          const canEditCa = permission.can(
            ProjectPermissionCertificateAuthorityActions.Edit,
            subject(ProjectPermissionSub.CertificateAuthorities, {
              name: ca.name
            })
          );

          return (
            <TableRow
              className={twMerge(!canEditCa && "cursor-not-allowed opacity-60")}
              key={`ca-${ca.id}`}
              onClick={() =>
                canEditCa &&
                handlePopUpOpen("ca", {
                  caId: ca.id,
                  name: ca.name,
                  type: ca.type
                })
              }
            >
              <TableCell>{ca.name}</TableCell>
              <TableCell>{EXTERNAL_CA_TYPE_NAME_MAP[ca.type] || ca.type}</TableCell>
              <TableCell>
                <Badge variant={getCaStatusBadgeVariant(ca.status)}>
                  {caStatusToNameMap[ca.status]}
                </Badge>
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
                            handlePopUpOpen("ca", {
                              caId: ca.id,
                              name: ca.name,
                              type: ca.type
                            });
                          }}
                          disabled={!isAllowed}
                          icon={<FontAwesomeIcon icon={faPencil} />}
                        >
                          Edit CA
                        </DropdownMenuItem>
                      )}
                    </ProjectPermissionCan>
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
                                type: ca.type,
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
                              caId: ca.id,
                              type: ca.type
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
