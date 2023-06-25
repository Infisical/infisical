import {
  IconButton,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  EmptyState
} from "@app/components/v2";
import { useOrganization } from "@app/context";
import { 
    useGetOrgInvoices
} from "@app/hooks/api";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDownload, faFileInvoice } from "@fortawesome/free-solid-svg-icons";

// TODO: optimize + modularize

export const BillingReceiptsTab = () => {
    const { currentOrg } = useOrganization();
    const { data, isLoading } = useGetOrgInvoices(currentOrg?._id ?? '');
    return (
        <div className="p-4 bg-mineshaft-900 mt-8 max-w-screen-lg rounded-lg border border-mineshaft-600">
          <h2 className="text-xl font-semibold flex-1 text-white">Invoices</h2>
          <TableContainer className="mt-4">
            <Table>
              <THead>
                <Tr>
                  <Th className="flex-1">Invoice #</Th>
                  <Th className="flex-1">Date</Th>
                  <Th className="flex-1">Status</Th>
                  <Th className="flex-1">Amount</Th>
                  <Th className="w-5"></Th>
                </Tr>
              </THead>
              <TBody>
                {!isLoading && data?.length > 0 && data.map(({
                    _id,
                    created,
                    paid,
                    number,
                    total,
                    invoice_pdf
                }: {
                    _id: string;
                    created: number;
                    paid: boolean;
                    number: string;
                    total: number;
                    invoice_pdf: string;
                }) => {
                    const formattedTotal = (Math.floor(total) / 100).toLocaleString('en-US', {
                        style: 'currency',
                        currency: 'USD',
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
                {isLoading && <TableSkeleton columns={5} key="invoices" />}
                {!isLoading && data?.length === 0 && (
                    <Tr>
                        <Td colSpan={5}>
                            <EmptyState 
                                title="No invoices on file" 
                                icon={faFileInvoice}
                            />
                        </Td>
                    </Tr>
                )}
              </TBody>
            </Table>
          </TableContainer>
        </div>
    );
}