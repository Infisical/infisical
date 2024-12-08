import { useState } from "react";
import { faCertificate } from "@fortawesome/free-solid-svg-icons";

import {
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
import { useOrganization } from "@app/context";
import { useListOrgSshCertificates } from "@app/hooks/api";
import { sshCertTypeToNameMap } from "@app/hooks/api/ssh-ca/constants";

const PER_PAGE_INIT = 25;

export const SshCertificatesTable = () => {
  const { currentOrg } = useOrganization();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PER_PAGE_INIT);

  const { data, isLoading } = useListOrgSshCertificates({
    orgId: currentOrg?.id ?? "",
    offset: (page - 1) * perPage,
    limit: perPage
  });

  console.log("SSH Certificates Table data: ", data);

  return (
    <TableContainer>
      <Table>
        <THead>
          <Tr>
            <Th>Serial Number</Th>
            <Th>Certificate Type</Th>
            <Th>Principals</Th>
          </Tr>
        </THead>
        <TBody>
          {isLoading && <TableSkeleton columns={4} innerKey="org-ssh-certificates" />}
          {!isLoading &&
            data?.certificates?.map((certificate) => {
              return (
                <Tr className="h-10" key={`certificate-${certificate.id}`}>
                  <Td>{certificate.serialNumber}</Td>
                  <Td>{sshCertTypeToNameMap[certificate.certType]}</Td>
                  <Td>{certificate.principals.join(", ")}</Td>
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
        <EmptyState title="No SSH certificates have been issued" icon={faCertificate} />
      )}
    </TableContainer>
  );
};
