import { subject } from "@casl/ability";
import * as x509 from "@peculiar/x509";
import { format } from "date-fns";
import FileSaver from "file-saver";
import { EllipsisIcon } from "lucide-react";

import { ProjectPermissionCan } from "@app/components/permissions";
import { Lottie } from "@app/components/v2";
import {
  Badge,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
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

  if (isPending) {
    return (
      <div className="flex h-40 w-full items-center justify-center">
        <Lottie icon="infisical_loading_white" isAutoPlay className="w-16" />
      </div>
    );
  }

  if (!caCerts?.length) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>This CA does not have any CA certificates installed</EmptyTitle>
          <EmptyDescription>Install a CA certificate to get started</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>CA Certificate #</TableHead>
          <TableHead>Not Before</TableHead>
          <TableHead>Not After</TableHead>
          <TableHead className="w-5" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {caCerts.map((caCert, index) => {
          const isLastItem = index === caCerts.length - 1;
          const caCertObj = new x509.X509Certificate(caCert.certificate);
          return (
            <TableRow key={`ca-cert=${caCert.serialNumber}`}>
              <TableCell>
                <div className="flex items-center gap-x-2">
                  CA Certificate {caCert.version}
                  {isLastItem && <Badge variant="info">Current</Badge>}
                </div>
              </TableCell>
              <TableCell>{format(new Date(caCertObj.notBefore), "yyyy-MM-dd")}</TableCell>
              <TableCell>{format(new Date(caCertObj.notAfter), "yyyy-MM-dd")}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <IconButton variant="ghost" size="xs">
                      <EllipsisIcon />
                    </IconButton>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <ProjectPermissionCan
                      I={ProjectPermissionCertificateAuthorityActions.Read}
                      a={subject(ProjectPermissionSub.CertificateAuthorities, {
                        name: caName
                      })}
                    >
                      {(isAllowed) => (
                        <DropdownMenuItem
                          isDisabled={!isAllowed}
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadTxtFile("cert.pem", caCert.certificate);
                          }}
                        >
                          Download CA Certificate
                        </DropdownMenuItem>
                      )}
                    </ProjectPermissionCan>
                    <ProjectPermissionCan
                      I={ProjectPermissionCertificateAuthorityActions.Read}
                      a={subject(ProjectPermissionSub.CertificateAuthorities, {
                        name: caName
                      })}
                    >
                      {(isAllowed) => (
                        <DropdownMenuItem
                          isDisabled={!isAllowed}
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadTxtFile("chain.pem", caCert.certificateChain);
                          }}
                        >
                          Download CA Certificate Chain
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
