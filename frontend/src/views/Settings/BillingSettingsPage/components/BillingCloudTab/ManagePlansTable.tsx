import { useSubscription } from "@app/context";
import { useOrganization } from "@app/context";
import { Tab } from '@headlessui/react'
import { Fragment } from 'react'
import { 
    useGetOrgPlanBillingInfo,
    useGetOrgPlanTable,
    useGetOrgPlansTable,
    useUpdateOrgPlan,
    useCreateProductCheckoutSession
} from "@app/hooks/api";
import {
  FormControl,
  Button,
  IconButton,
  Input,
  Select,
  SelectItem,
  Table,
  TableContainer,
  TableSkeleton,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  EmptyState,
  Modal,
  ModalContent
} from "@app/components/v2";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFileInvoice, faCircleCheck, faCircleXmark } from "@fortawesome/free-solid-svg-icons";

// TODO: upgrade

type Props = {
    billingCycle: 'monthly' | 'yearly'
}

export const ManagePlansTable = ({
    billingCycle
}: Props) => {
    const { currentOrg } = useOrganization();
    const { subscription, isLoading: isSubscriptionLoading } = useSubscription();
    const { data: tableData, isLoading: isTableDataLoading } = useGetOrgPlansTable({
        organizationId: currentOrg?._id ?? '',
        billingCycle
    });
    const updateOrgPlan = useUpdateOrgPlan();
    const createProductCheckoutSession = useCreateProductCheckoutSession();

    console.log('tableData: ', tableData);

    const displayCell = (value: null | number | string | boolean) => {
        if (value === null) return '-';
        
        if (typeof value === 'boolean') {
            if (value) return (
                <FontAwesomeIcon 
                    icon={faCircleCheck}
                    color='#2ecc71'
                />
            );

            return (
                <FontAwesomeIcon 
                    icon={faCircleXmark}
                    color='#e74c3c'
                />
            );
        }
        
        return value;
    }

    return (
        <TableContainer>
            <Table>
                <THead>
                    {!isTableDataLoading && tableData?.head.length > 0 && (
                        <Tr>
                            <Th className="">Feature / Limit</Th>
                            {tableData.head.map(({
                                name,
                                slug,
                                priceLine
                            }: {
                                name: string;
                                slug: string;
                                priceLine: string;
                            }) => {
                                return (
                                    <Th className={`${slug === subscription.slug ? "bg-mineshaft-600 text-center" : "text-center"}`}>
                                        <p>{name}</p>
                                        <p>{priceLine}</p>
                                    </Th>
                                );
                            })}
                        </Tr>
                    )}
                </THead>
                <TBody>
                    {!isTableDataLoading && tableData?.rows.length > 0 && tableData.rows.map(({
                        name,
                        starter,
                        team,
                        pro,
                        enterprise
                    }: {
                        name: string;
                        starter: null | number | string | boolean;
                        team: null | number | string | boolean;
                        pro: null | number | string | boolean;
                        enterprise: null | number | string | boolean;
                    }) => {
                        return (
                            <Tr className="h-12">
                                <Td>{displayCell(name)}</Td>
                                <Td className={'starter' === subscription.slug ? "bg-mineshaft-600 text-center" : "text-center"}>{displayCell(starter)}</Td>
                                <Td className={'team' === subscription.slug ? "bg-mineshaft-600 text-center" : "text-center"}>{displayCell(team)}</Td>
                                <Td className={'pro' === subscription.slug ? "bg-mineshaft-600 text-center" : "text-center"}>{displayCell(pro)}</Td>
                                <Td className={'enterprise' === subscription.slug ? "bg-mineshaft-600 text-center" : "text-center"}>{displayCell(enterprise)}</Td>
                            </Tr>
                        );
                    })}
                    {isTableDataLoading && <TableSkeleton columns={5} key="cloud-products" />}
                    {!isTableDataLoading && tableData?.rows.length === 0 && (
                        <Tr>
                            <Td colSpan={5}>
                                <EmptyState 
                                    title="No cloud product details found" 
                                    icon={faFileInvoice}
                                />
                            </Td>
                        </Tr>
                    )}
                    {subscription && !isTableDataLoading && tableData?.head.length > 0 && (
                        <Tr className="h-12">
                            <Td></Td>
                            {tableData.head.map(({
                                slug,
                                productId
                            }: {
                                slug: string;
                                productId: string;
                            }) => {
                                const isCurrentPlan = slug === subscription.slug;

                                console.log('productId: ', productId);
                                return isCurrentPlan ? (
                                    <Td className="bg-mineshaft-600">
                                        <p className="text-center font-semibold">Current</p>
                                    </Td>
                                ) : (
                                    <Td>
                                        <Button 
                                            onClick={async () => {
                                                console.log('upgrade to product: ', productId);
                                                if (!currentOrg?._id) return;
                                                // const test = await updateOrgPlan.mutateAsync({
                                                //     organizationId: currentOrg._id,
                                                //     productId
                                                // });
                                                
                                                const { url } = await createProductCheckoutSession.mutateAsync({
                                                    organizationId: currentOrg._id,
                                                    productId,
                                                    success_url: window.location.href
                                                })
                                                
                                                window.location.href = url;
                                            }}
                                            color="mineshaft"
                                            className="w-full"
                                        >
                                            Upgrade
                                        </Button>
                                    </Td>
                                );
                            })}
                        </Tr>
                    )}
                </TBody>
            </Table>
        </TableContainer>
    );
}