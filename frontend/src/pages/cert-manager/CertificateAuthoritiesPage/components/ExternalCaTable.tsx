import { subject } from "@casl/ability";
import {
  faBan,
  faCertificate,
  faEllipsis,
  faPencil,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
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
  useProject,
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
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const { data, isPending } = useListExternalCasByProjectId(currentProject.id);

  return (
    <div>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>Name</Th>
              <Th>Type</Th>
              <Th>Status</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {isPending && <TableSkeleton columns={3} innerKey="project-cas" />}
            {!isPending &&
              data &&
              data.length > 0 &&
              data.map((ca) => {
                const canEditCa = permission.can(
                  ProjectPermissionCertificateAuthorityActions.Edit,
                  subject(ProjectPermissionSub.CertificateAuthorities, {
                    name: ca.name
                  })
                );

                return (
                  <Tr
                    className={twMerge(
                      "h-10 transition-colors duration-100",
                      canEditCa && "cursor-pointer hover:bg-mineshaft-700",
                      !canEditCa && "cursor-not-allowed opacity-60"
                    )}
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
                    <Td>{ca.name}</Td>
                    <Td>{EXTERNAL_CA_TYPE_NAME_MAP[ca.type] || ca.type}</Td>
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
                                    !isAllowed &&
                                      "pointer-events-none cursor-not-allowed opacity-50"
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
                    </Td>
                  </Tr>
                );
              })}
          </TBody>
        </Table>
        {!isPending && data?.length === 0 && (
          <EmptyState
            title="No external certificate authorities have been created"
            icon={faCertificate}
          />
        )}
      </TableContainer>
    </div>
  );
};
