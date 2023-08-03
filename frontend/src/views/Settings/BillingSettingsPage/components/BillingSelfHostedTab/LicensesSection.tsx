import { faFileContract } from "@fortawesome/free-solid-svg-icons";

import {
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
import { useOrganization } from "@app/context";
import {
    useGetOrgLicenses
} from "@app/hooks/api";

export const LicensesSection = () => {
    const { currentOrg } = useOrganization();
    const { data, isLoading } = useGetOrgLicenses(currentOrg?._id ?? "");
    
    return (
        <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
            <h2 className="mb-8 flex-1 text-xl font-semibold text-white">Enterprise licenses</h2>
            <TableContainer className="mt-4">
                <Table>
                    <THead>
                        <Tr>
                            <Th>License Key</Th>
                            <Th>Status</Th>
                            <Th>Issued Date</Th>
                            <Th>Expiry Date</Th>
                        </Tr>
                    </THead>
                    <TBody>
                        {!isLoading && data && data?.length > 0 && data.map(({
                            _id,
                            licenseKey,
                            isActivated,
                            createdAt,
                            expiresAt
                        }) => {
                            const formattedCreatedAt = new Date(createdAt).toISOString().split("T")[0];
                            const formattedExpiresAt = new Date(expiresAt).toISOString().split("T")[0];
                            return (
                                <Tr key={`license-${_id}`} className="h-10">
                                    <Td>{licenseKey}</Td>
                                    <Td>{isActivated ? "Active" : "Inactive"}</Td>
                                    <Td>{formattedCreatedAt}</Td>
                                    <Td>{formattedExpiresAt}</Td>
                                </Tr>
                            );
                        })}
                        {isLoading && <TableSkeleton columns={4} innerKey="licenses" />}
                        {!isLoading && data && data?.length === 0 && (
                            <Tr>
                                <Td colSpan={4}>
                                    <EmptyState title="No enterprise licenses on file" icon={faFileContract} />
                                </Td>
                            </Tr>
                        )}
                    </TBody>
                </Table>
            </TableContainer>
        </div>
    );
}