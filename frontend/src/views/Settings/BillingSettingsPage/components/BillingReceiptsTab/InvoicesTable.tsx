import { faDownload, faFileInvoice } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  EmptyState,
  IconButton,
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
import { useGetOrgInvoices } from "@app/hooks/api";

export const InvoicesTable = () => {
  const { currentOrg } = useOrganization();
  const { data, isLoading } = useGetOrgInvoices(currentOrg?._id ?? "");
  return (
    <TableContainer className="mt-8">
      <Table>
        <THead>
          <Tr>
            <Th className="flex-1">Invoice #</Th>
            <Th className="flex-1">Date</Th>
            <Th className="flex-1">Status</Th>
            <Th className="flex-1">Amount</Th>
            <Th className="w-5" />
          </Tr>
        </THead>
        <TBody>
          {!isLoading &&
            data &&
            data?.length > 0 &&
            data.map(({ _id, created, paid, number, total, invoice_pdf }) => {
              const formattedTotal = (Math.floor(total) / 100).toLocaleString("en-US", {
                style: "currency",
                currency: "USD"
              });
              const createdDate = new Date(created * 1000);
              const day: number = createdDate.getDate();
              const month: number = createdDate.getMonth() + 1;
              const year: number = createdDate.getFullYear();
              const formattedDate: string = `${day}/${month}/${year}`;

              return (
                <Tr key={`invoice-${_id}`} className="h-10">
                  <Td>{number}</Td>
                  <Td>{formattedDate}</Td>
                  <Td>{paid ? "Paid" : "Not Paid"}</Td>
                  <Td>{formattedTotal}</Td>
                  <Td>
                    <IconButton
                      onClick={async () => window.open(invoice_pdf)}
                      size="lg"
                      variant="plain"
                      ariaLabel="update"
                    >
                      <FontAwesomeIcon icon={faDownload} />
                    </IconButton>
                  </Td>
                </Tr>
              );
            })}
          {isLoading && <TableSkeleton columns={5} innerKey="invoices" />}
          {!isLoading && data && data?.length === 0 && (
            <Tr>
              <Td colSpan={5}>
                <EmptyState title="No invoices on file" icon={faFileInvoice} />
              </Td>
            </Tr>
          )}
        </TBody>
      </Table>
    </TableContainer>
  );
};
