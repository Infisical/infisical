import { faCertificate, faEllipsis } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import * as x509 from "@peculiar/x509";
import { format } from "date-fns";
import FileSaver from "file-saver";
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
  Tr
} from "@app/components/v2";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { useGetCaCerts } from "@app/hooks/api";

type Props = {
  caId: string;
};

export const CaCertificatesTable = ({ caId }: Props) => {
  const { data: caCerts, isLoading } = useGetCaCerts(caId);

  const downloadTxtFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    FileSaver.saveAs(blob, filename);
  };

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>CA Certificate #</Th>
            <Th>Not Before</Th>
            <Th>Not After</Th>
            <Th className="w-5" />
          </Tr>
        </THead>
        <TBody>
          {isLoading && <TableSkeleton columns={4} innerKey="ca-certificates" />}
          {!isLoading &&
            caCerts?.map((caCert, index) => {
              const isLastItem = index === caCerts.length - 1;
              const caCertObj = new x509.X509Certificate(caCert.certificate);
              return (
                <Tr key={`ca-cert=${caCert.serialNumber}`}>
                  <Td>
                    <div className="flex items-center">
                      CA Certificate {caCert.version}
                      {isLastItem && (
                        <Badge variant="success" className="ml-4">
                          Current
                        </Badge>
                      )}
                    </div>
                  </Td>
                  <Td>{format(new Date(caCertObj.notBefore), "yyyy-MM-dd")}</Td>
                  <Td>{format(new Date(caCertObj.notAfter), "yyyy-MM-dd")}</Td>
                  <Td>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild className="rounded-lg">
                        <div className="hover:text-primary-400 data-[state=open]:text-primary-400">
                          <FontAwesomeIcon size="sm" icon={faEllipsis} />
                        </div>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="p-1">
                        <ProjectPermissionCan
                          I={ProjectPermissionActions.Edit}
                          a={ProjectPermissionSub.Identity}
                        >
                          {(isAllowed) => (
                            <DropdownMenuItem
                              className={twMerge(
                                !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadTxtFile("cert.pem", caCert.certificate);
                              }}
                              disabled={!isAllowed}
                            >
                              Download CA Certificate
                            </DropdownMenuItem>
                          )}
                        </ProjectPermissionCan>
                        <ProjectPermissionCan
                          I={ProjectPermissionActions.Delete}
                          a={ProjectPermissionSub.Identity}
                        >
                          {(isAllowed) => (
                            <DropdownMenuItem
                              className={twMerge(
                                !isAllowed && "pointer-events-none cursor-not-allowed opacity-50"
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadTxtFile("chain.pem", caCert.certificateChain);
                              }}
                              disabled={!isAllowed}
                            >
                              Download CA Certificate Chain
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
      {!isLoading && !caCerts?.length && (
        <EmptyState
          title="This CA does not have any CA certificates installed"
          icon={faCertificate}
        />
      )}
    </TableContainer>
  );
};
