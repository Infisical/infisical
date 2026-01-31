import { subject } from "@casl/ability";
import { faCertificate } from "@fortawesome/free-solid-svg-icons";
import * as x509 from "@peculiar/x509";
import { format } from "date-fns";
import FileSaver from "file-saver";
import { EllipsisIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { EmptyState, TableSkeleton } from "@app/components/v2";
import {
  Badge,
  UnstableDropdownMenu,
  UnstableDropdownMenuContent,
  UnstableDropdownMenuItem,
  UnstableDropdownMenuTrigger,
  UnstableIconButton,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";
import { ProjectPermissionCertificateAuthorityActions, ProjectPermissionSub } from "@app/context";
import { useGetCaCerts } from "@app/hooks/api";

type Props = {
  caId: string;
  caName: string;
};

export const CaCertificatesTable = ({ caId, caName }: Props) => {
  const { data: caCerts, isPending } = useGetCaCerts(caId);

  const downloadTxtFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    FileSaver.saveAs(blob, filename);
  };

  return (
    <>
      <UnstableTable>
        <UnstableTableHeader>
          <UnstableTableRow>
            <UnstableTableHead>CA Certificate #</UnstableTableHead>
            <UnstableTableHead>Not Before</UnstableTableHead>
            <UnstableTableHead>Not After</UnstableTableHead>
            <UnstableTableHead className="w-5" />
          </UnstableTableRow>
        </UnstableTableHeader>
        <UnstableTableBody>
          {isPending && <TableSkeleton columns={4} innerKey="ca-certificates" />}
          {!isPending &&
            caCerts?.map?.((caCert, index) => {
              const isLastItem = index === caCerts.length - 1;
              const caCertObj = new x509.X509Certificate(caCert.certificate);
              return (
                <UnstableTableRow key={`ca-cert=${caCert.serialNumber}`}>
                  <UnstableTableCell>
                    <div className="flex items-center gap-x-2">
                      CA Certificate {caCert.version}
                      {isLastItem && <Badge variant="info">Current</Badge>}
                    </div>
                  </UnstableTableCell>
                  <UnstableTableCell>
                    {format(new Date(caCertObj.notBefore), "yyyy-MM-dd")}
                  </UnstableTableCell>
                  <UnstableTableCell>
                    {format(new Date(caCertObj.notAfter), "yyyy-MM-dd")}
                  </UnstableTableCell>
                  <UnstableTableCell>
                    <UnstableDropdownMenu>
                      <UnstableDropdownMenuTrigger asChild>
                        <UnstableIconButton variant="ghost" size="xs">
                          <EllipsisIcon />
                        </UnstableIconButton>
                      </UnstableDropdownMenuTrigger>
                      <UnstableDropdownMenuContent align="end">
                        <ProjectPermissionCan
                          I={ProjectPermissionCertificateAuthorityActions.Read}
                          a={subject(ProjectPermissionSub.CertificateAuthorities, {
                            name: caName
                          })}
                        >
                          {(isAllowed) => (
                            <UnstableDropdownMenuItem
                              isDisabled={!isAllowed}
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadTxtFile("cert.pem", caCert.certificate);
                              }}
                            >
                              Download CA Certificate
                            </UnstableDropdownMenuItem>
                          )}
                        </ProjectPermissionCan>
                        <ProjectPermissionCan
                          I={ProjectPermissionCertificateAuthorityActions.Read}
                          a={subject(ProjectPermissionSub.CertificateAuthorities, {
                            name: caName
                          })}
                        >
                          {(isAllowed) => (
                            <UnstableDropdownMenuItem
                              isDisabled={!isAllowed}
                              onClick={(e) => {
                                e.stopPropagation();
                                downloadTxtFile("chain.pem", caCert.certificateChain);
                              }}
                            >
                              Download CA Certificate Chain
                            </UnstableDropdownMenuItem>
                          )}
                        </ProjectPermissionCan>
                      </UnstableDropdownMenuContent>
                    </UnstableDropdownMenu>
                  </UnstableTableCell>
                </UnstableTableRow>
              );
            })}
        </UnstableTableBody>
      </UnstableTable>
      {!isPending && !caCerts?.length && (
        <EmptyState
          title="This CA does not have any CA certificates installed"
          icon={faCertificate}
        />
      )}
    </>
  );
};
