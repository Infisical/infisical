import { useRouter } from "next/router";
import {
  faBan,
  faCertificate,
  faEllipsis,
  faEye,
  faFile,
  faTrash
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";
import { twMerge } from "tailwind-merge";

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
import {
  ProjectPermissionActions,
  ProjectPermissionSub,
  useSubscription,
  useWorkspace
} from "@app/context";
import { CaStatus, useListWorkspaceCas } from "@app/hooks/api";
import {
  caStatusToNameMap,
  caTypeToNameMap,
  getCaStatusBadgeVariant
} from "@app/hooks/api/ca/constants";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<
      ["installCaCert", "caCert", "ca", "deleteCa", "caStatus", "caCrl", "upgradePlan"]
    >,
    data?: {
      caId?: string;
      dn?: string;
      status?: CaStatus;
      description?: string;
    }
  ) => void;
};

export const CaTable = ({ handlePopUpOpen }: Props) => {
  const router = useRouter();
  const { subscription } = useSubscription();
  const { currentWorkspace } = useWorkspace();
  const { data, isLoading } = useListWorkspaceCas({
    projectSlug: currentWorkspace?.slug ?? ""
  });

  return (
    <div>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>Friendly Name</Th>
              <Th>Status</Th>
              <Th>Type</Th>
              <Th>Valid Until</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {isLoading && <TableSkeleton columns={3} innerKey="project-cas" />}
            {!isLoading &&
              data &&
              data.length > 0 &&
              data.map((ca) => {
                return (
                  <Tr
                    className="h-10 cursor-pointer transition-colors duration-100 hover:bg-mineshaft-700"
                    key={`ca-${ca.id}`}
                    onClick={() => router.push(`/project/${currentWorkspace?.id}/ca/${ca.id}`)}
                  >
                    <Td>{ca.friendlyName}</Td>
                    <Td>
                      <Badge variant={getCaStatusBadgeVariant(ca.status)}>
                        {caStatusToNameMap[ca.status]}
                      </Badge>
                    </Td>
                    <Td>{caTypeToNameMap[ca.type]}</Td>
                    <Td>
                      <div className="flex items-center ">
                        <p>{ca.notAfter ? format(new Date(ca.notAfter), "yyyy-MM-dd") : "-"}</p>
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
                                    if (!subscription?.caCrl) {
                                      handlePopUpOpen("upgradePlan", {
                                        description:
                                          "You can use the certificate revocation list (CRL) feature if you upgrade your Infisical plan."
                                      });
                                    } else {
                                      handlePopUpOpen("caCrl", {
                                        caId: ca.id
                                      });
                                    }
                                  }}
                                  disabled={!isAllowed}
                                  icon={<FontAwesomeIcon icon={faFile} />}
                                >
                                  View CRL
                                </DropdownMenuItem>
                              )}
                            </ProjectPermissionCan>
                          )}
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Read}
                            a={ProjectPermissionSub.CertificateAuthorities}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                className={twMerge(
                                  !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePopUpOpen("ca", {
                                    caId: ca.id
                                  });
                                }}
                                disabled={!isAllowed}
                                icon={<FontAwesomeIcon icon={faEye} />}
                              >
                                View CA
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
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
                                    caId: ca.id,
                                    dn: ca.dn
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
        {!isLoading && data?.length === 0 && (
          <EmptyState title="No certificate authorities have been created" icon={faCertificate} />
        )}
      </TableContainer>
    </div>
  );
};
