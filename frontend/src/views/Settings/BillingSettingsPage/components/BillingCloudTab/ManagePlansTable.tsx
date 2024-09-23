import { faCircleCheck, faCircleXmark, faFileInvoice } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import {
  Button,
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
import { useOrganization, useSubscription } from "@app/context";
import { useCreateCustomerPortalSession, useGetOrgPlansTable } from "@app/hooks/api";

type Props = {
  billingCycle: "monthly" | "yearly";
};

export const ManagePlansTable = ({ billingCycle }: Props) => {
  const { currentOrg } = useOrganization();
  const { subscription } = useSubscription();
  const { data: tableData, isLoading: isTableDataLoading } = useGetOrgPlansTable({
    organizationId: currentOrg?.id ?? "",
    billingCycle
  });
  const createCustomerPortalSession = useCreateCustomerPortalSession();

  const displayCell = (value: null | number | string | boolean) => {
    if (value === null) return "Unlimited";

    if (typeof value === "boolean") {
      if (value) return <FontAwesomeIcon icon={faCircleCheck} color="#2ecc71" />;

      return <FontAwesomeIcon icon={faCircleXmark} color="#e74c3c" />;
    }

    return value;
  };

  return (
    <TableContainer>
      <Table>
        <THead>
          {subscription && !isTableDataLoading && tableData && (
            <Tr>
              <Th className="">Feature / Limit</Th>
              {tableData.head.map(({ name, priceLine }) => {
                return (
                  <Th
                    key={`plans-feature-head-${billingCycle}-${name}`}
                    className="flex-1 text-center"
                  >
                    <p>{name}</p>
                    <p>{priceLine}</p>
                  </Th>
                );
              })}
            </Tr>
          )}
        </THead>
        <TBody>
          {subscription &&
            !isTableDataLoading &&
            tableData &&
            tableData.rows.map(({ name, starter, pro, enterprise }) => {
              return (
                <Tr className="h-12" key={`plans-feature-row-${billingCycle}-${name}`}>
                  <Td>{displayCell(name)}</Td>
                  <Td className="text-center">{displayCell(starter)}</Td>
                  <Td className="text-center">{displayCell(pro)}</Td>
                  <Td className="text-center">{displayCell(enterprise)}</Td>
                </Tr>
              );
            })}
          {isTableDataLoading && <TableSkeleton columns={5} innerKey="cloud-products" />}
          {!isTableDataLoading && tableData?.rows.length === 0 && (
            <Tr>
              <Td colSpan={5}>
                <EmptyState title="No cloud product details found" icon={faFileInvoice} />
              </Td>
            </Tr>
          )}
          {subscription && !isTableDataLoading && tableData && (
            <Tr className="h-12">
              <Td />
              {tableData.head.map(({ slug, tier }) => {
                const isCurrentPlan = slug === subscription.slug;
                let subscriptionText = "Upgrade";

                if (subscription.tier > tier) {
                  subscriptionText = "Downgrade";
                }

                if (tier === 3) {
                  subscriptionText = "Contact sales";
                }

                return isCurrentPlan ? (
                  <Td>
                    <Button colorSchema="secondary" className="w-full" isDisabled>
                      Current
                    </Button>
                  </Td>
                ) : (
                  <Td>
                    <Button
                      onClick={async () => {
                        if (!currentOrg?.id) return;

                        if (tier !== 3) {
                          const { url } = await createCustomerPortalSession.mutateAsync(
                            currentOrg.id
                          );
                          window.location.href = url;
                          return;
                        }

                        window.location.href = "https://infisical.com/scheduledemo";
                      }}
                      color="mineshaft"
                      className="w-full"
                    >
                      {subscriptionText}
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
};
