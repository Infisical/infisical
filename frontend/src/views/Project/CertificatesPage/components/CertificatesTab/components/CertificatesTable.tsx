import {
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
  Tr} from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub, useWorkspace } from "@app/context";
import { useListWorkspaceCertificates } from "@app/hooks/api";
import { UsePopUpState } from "@app/hooks/usePopUp";

type Props = {
  handlePopUpOpen: (
    popUpName: keyof UsePopUpState<["certificate", "deleteCertificate", "certificateCert"]>,
    data?: {
      certId?: string;
      commonName?: string;
    }
  ) => void;
};

export const CertificatesTable = ({ handlePopUpOpen }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const { data, isLoading } = useListWorkspaceCertificates(currentWorkspace?.slug ?? "");
  return (
    <div>
      <TableContainer>
        <Table>
          <THead>
            <Tr>
              <Th>Certificate ID</Th>
              <Th>Common Name</Th>
              <Th>Valid Until</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {isLoading && <TableSkeleton columns={3} innerKey="project-cas" />}
            {!isLoading &&
              data &&
              data.length > 0 &&
              data.map((certificate) => {
                return (
                  <Tr className="h-10" key={`certificate-${certificate.id}`}>
                    <Td>{certificate.id}</Td>
                    <Td>{certificate.commonName}</Td>
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
                                    certId: certificate.id
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
                                    certId: certificate.id
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
                                  handlePopUpOpen("deleteCertificate", {
                                    certId: certificate.id,
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
        {!isLoading && data?.length === 0 && (
          <EmptyState title="No certificates have been created" icon={faCertificate} />
        )}
      </TableContainer>
    </div>
  );
};
