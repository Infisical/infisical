import { useState } from "react";
import { faCertificate } from "@fortawesome/free-solid-svg-icons";
import { format } from "date-fns";

import {
  Badge,
  EmptyState,
  Pagination,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr
} from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useListWorkspaceSshCertificates } from "@app/hooks/api";

import { getSshCertStatusBadgeDetails } from "./SshCertificatesTable.utils";

const PER_PAGE_INIT = 25;

export const SshCertificatesTable = () => {
  const { currentWorkspace } = useWorkspace();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PER_PAGE_INIT);

  const { data, isPending } = useListWorkspaceSshCertificates({
    projectId: currentWorkspace?.id || "",
    offset: (page - 1) * perPage,
    limit: perPage
  });

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Principals</Th>
            <Th>Status</Th>
            <Th>Not Before</Th>
            <Th>Not After</Th>
          </Tr>
        </THead>
        <TBody>
          {isPending && <TableSkeleton columns={4} innerKey="org-ssh-certificates" />}
          {!isPending &&
            data?.certificates?.map((certificate) => {
              const { variant, label } = getSshCertStatusBadgeDetails(certificate.notAfter);
              return (
                <Tr className="h-10" key={`certificate-${certificate.id}`}>
                  <Td>{certificate.principals.join(", ")}</Td>
                  <Td>
                    <Badge variant={variant}>{label}</Badge>
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
                </Tr>
              );
            })}
        </TBody>
      </Table>
      {!isPending && data?.totalCount !== undefined && data.totalCount >= PER_PAGE_INIT && (
        <Pagination
          count={data.totalCount}
          page={page}
          perPage={perPage}
          onChangePage={(newPage) => setPage(newPage)}
          onChangePerPage={(newPerPage) => setPerPage(newPerPage)}
        />
      )}
      {!isPending && !data?.certificates?.length && (
        <EmptyState title="No SSH certificates have been issued" icon={faCertificate} />
      )}
    </TableContainer>
  );
};
