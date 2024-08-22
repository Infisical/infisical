import { useState } from "react";
import {
  faBan,
  faCertificate,
  faEllipsis,
  faEye,
  faFileExport,
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
  Pagination,
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
import { useListWorkspaceCertificates } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

import { getCertValidUntilBadgeDetails } from "./CertificatesTable.utils";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<
      ["certificate", "deleteCertificate", "revokeCertificate", "certificateCert"]
    >,
    data?: {
      serialNumber?: string;
      commonName?: string;
    }
  ) => void;
};

const PER_PAGE_INIT = 25;

export const CertificatesTable = ({ handlePopUpOpen }: Props) => {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PER_PAGE_INIT);

  const { currentWorkspace } = useWorkspace();
  const { data, isLoading } = useListWorkspaceCertificates({
    projectSlug: currentWorkspace?.slug ?? "",
    offset: (page - 1) * perPage,
    limit: perPage
  });

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Friendly Name</Th>
            <Th>Status</Th>
            <Th>Not Before</Th>
            <Th>Not After</Th>
            <Th />
          </Tr>
        </THead>
        <TBody>
          {isLoading && <TableSkeleton columns={3} innerKey="project-cas" />}
          {!isLoading &&
            data?.certificates.map((certificate) => {
              const { variant, label } = getCertValidUntilBadgeDetails(certificate.notAfter);
              return (
                <Tr className="h-10" key={`certificate-${certificate.id}`}>
                  <Td>{certificate.friendlyName}</Td>
                  <Td>
                    <Badge className="" variant={variant}>
                      {label}
                    </Badge>
                  </Td>
                  <Td>
                    {certificate.notBefore
                      ? format(new Date(certificate.notBefore), "yyyy-MM-dd")
                      : "-"}
                  </Td>
                  <Td>
                    {certificate.notAfter
                      ? format(new Date(certificate.notAfter), "yyyy-MM-dd")
                      : "-"}
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
                          I={ProjectPermissionActions.Read}
                          a={ProjectPermissionSub.Certificates}
                        >
                          {(isAllowed) => (
                            <DropdownMenuItem
                              className={twMerge(
                                !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                              )}
                              onClick={async () =>
                                handlePopUpOpen("certificateCert", {
                                  serialNumber: certificate.serialNumber
                                })
                              }
                              disabled={!isAllowed}
                              icon={<FontAwesomeIcon icon={faFileExport} />}
                            >
                              Export Certificate
                            </DropdownMenuItem>
                          )}
                        </ProjectPermissionCan>
                        <ProjectPermissionCan
                          I={ProjectPermissionActions.Read}
                          a={ProjectPermissionSub.Certificates}
                        >
                          {(isAllowed) => (
                            <DropdownMenuItem
                              className={twMerge(
                                !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                              )}
                              onClick={async () =>
                                handlePopUpOpen("certificate", {
                                  serialNumber: certificate.serialNumber
                                })
                              }
                              disabled={!isAllowed}
                              icon={<FontAwesomeIcon icon={faEye} />}
                            >
                              View Details
                            </DropdownMenuItem>
                          )}
                        </ProjectPermissionCan>
                        <ProjectPermissionCan
                          I={ProjectPermissionActions.Delete}
                          a={ProjectPermissionSub.Certificates}
                        >
                          {(isAllowed) => (
                            <DropdownMenuItem
                              className={twMerge(
                                !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                              )}
                              onClick={async () =>
                                handlePopUpOpen("revokeCertificate", {
                                  serialNumber: certificate.serialNumber
                                })
                              }
                              disabled={!isAllowed}
                              icon={<FontAwesomeIcon icon={faBan} />}
                            >
                              Revoke Certificate
                            </DropdownMenuItem>
                          )}
                        </ProjectPermissionCan>
                        <ProjectPermissionCan
                          I={ProjectPermissionActions.Delete}
                          a={ProjectPermissionSub.Certificates}
                        >
                          {(isAllowed) => (
                            <DropdownMenuItem
                              className={twMerge(
                                !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                              )}
                              onClick={async () =>
                                handlePopUpOpen("deleteCertificate", {
                                  serialNumber: certificate.serialNumber,
                                  commonName: certificate.commonName
                                })
                              }
                              disabled={!isAllowed}
                              icon={<FontAwesomeIcon icon={faTrash} />}
                            >
                              Delete Certificate
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
      {!isLoading && data?.totalCount !== undefined && data.totalCount >= PER_PAGE_INIT && (
        <Pagination
          count={data.totalCount}
          page={page}
          perPage={perPage}
          onChangePage={(newPage) => setPage(newPage)}
          onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
        />
      )}
      {!isLoading && !data?.certificates?.length && (
        <EmptyState title="No certificates have been issued" icon={faCertificate} />
      )}
    </TableContainer>
  );
};
