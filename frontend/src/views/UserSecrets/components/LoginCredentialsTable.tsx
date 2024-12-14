import { Table, TableContainer, TableSkeleton, TBody, Th, THead, Tr } from "@app/components/v2";

export const LoginCredentialsTable = () => {
    // const [page, setPage] = useState(1);
    // const [perPage, setPerPage] = useState(10);
    const isLoading = false;
    return (
        <TableContainer>
            <Table>
                <THead>
                    <Tr>
                        <Th className="w-5" />
                        <Th>Name</Th>
                        <Th>Username</Th>
                        <Th>Password</Th>
                        <Th>Created At</Th>
                        <Th aria-label="button" className="w-5" />
                    </Tr>
                </THead>
                <TBody>
                    {isLoading && <TableSkeleton columns={7} innerKey="shared-secrets" />}
                </TBody>
            </Table>
        </TableContainer>
    )
}