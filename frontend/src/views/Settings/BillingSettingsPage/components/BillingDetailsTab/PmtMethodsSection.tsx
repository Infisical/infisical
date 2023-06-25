import {
  Button,
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
    useGetOrgPmtMethods,
    useAddOrgPmtMethod,
    useDeleteOrgPmtMethod
} from "@app/hooks/api";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faXmark, faCreditCard } from "@fortawesome/free-solid-svg-icons";

// TODO: optimize + modularize

export const PmtMethodsSection = () => {
    const { currentOrg } = useOrganization();
    const { data, isLoading } = useGetOrgPmtMethods(currentOrg?._id ?? '');
    const addOrgPmtMethod = useAddOrgPmtMethod();
    const deleteOrgPmtMethod = useDeleteOrgPmtMethod();
    
    const handleAddPmtMethodBtnClick = async () => {
        if (!currentOrg?._id) return;
        const url = await addOrgPmtMethod.mutateAsync({
            organizationId: currentOrg._id,
            success_url: window.location.href,
            cancel_url: window.location.href
        });
        
        window.location.href = url;
    }

    const handleDeletePmtMethodBtnClick = async (pmtMethodId: string) => {
        if (!currentOrg?._id) return;
        await deleteOrgPmtMethod.mutateAsync({
            organizationId: currentOrg._id,
            pmtMethodId
        });
    }
    
    return (
        <div className="p-4 bg-mineshaft-900 mt-8 max-w-screen-lg rounded-lg border border-mineshaft-600">
            <div className="flex items-center mb-8">
                <h2 className="text-xl font-semibold flex-1 text-white">
                    Payment Methods
                </h2>
                <Button 
                    color="mineshaft"
                    type="submit"
                    leftIcon={<FontAwesomeIcon icon={faPlus} />}
                    onClick={handleAddPmtMethodBtnClick}
                >
                    Add method
                </Button>
            </div>
            <TableContainer className="mt-4">
            <Table>
              <THead>
                <Tr>
                  <Th className="flex-1">Brand</Th>
                  <Th className="flex-1">Type</Th>
                  <Th className="flex-1">Last 4 Digits</Th>
                  <Th className="flex-1">Expiration</Th>
                  <Th className="w-5"></Th>
                </Tr>
              </THead>
              <TBody>
                {!isLoading && data?.length > 0 && data.map(({
                    _id,
                    brand,
                    exp_month,
                    exp_year,
                    funding,
                    last4
                }: {
                    _id: string;
                    brand: string;
                    exp_month: number;
                    exp_year: number;
                    funding: string;
                    last4: string;
                }) => (
                    <Tr key={`pmt-method-${_id}`} className="h-10">
                        <Td>{brand}</Td>
                        <Td>{funding}</Td>
                        <Td>{last4}</Td>
                        <Td>{`${exp_month}/${exp_year}`}</Td>
                        <Td>
                            <IconButton
                                onClick={async () => {
                                    console.log('delete pmt method!');
                                    await handleDeletePmtMethodBtnClick(_id);
                                    console.log('delete pmt method done!');
                                }}
                                size="lg"
                                colorSchema="danger"
                                variant="plain"
                                ariaLabel="update"
                            >
                                <FontAwesomeIcon icon={faXmark} />
                            </IconButton>
                        </Td>
                    </Tr>
                ))}
                {isLoading && <TableSkeleton columns={5} key="pmt-methods" />}
                {!isLoading && data?.length === 0 && (
                    <Tr>
                        <Td colSpan={5}>
                            <EmptyState 
                                title="No payment methods on file" 
                                icon={faCreditCard}
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