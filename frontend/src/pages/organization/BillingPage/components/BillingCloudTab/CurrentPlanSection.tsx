import { useState } from "react";
import {
  faCircleCheck,
  faCircleXmark,
  faFileInvoice,
  faInfoCircle
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";

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
  Tooltip,
  Tr
} from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useGetOrgPlanTable } from "@app/hooks/api";
import { SubscriptionProducts } from "@app/hooks/api/subscriptions/types";

import { PlanUsageStats } from "./PlanUsageStats";

export const CurrentPlanSection = () => {
  const { currentOrg } = useOrganization();
  const { data, isPending } = useGetOrgPlanTable(currentOrg?.id ?? "");
  const [selectedSubscriptionProduct, setSelectedSubscriptionProduct] = useState(
    SubscriptionProducts.Platform
  );

  const displayCell = (value: null | number | string | boolean) => {
    if (value === null) return "-";

    if (typeof value === "boolean") {
      if (value) return <FontAwesomeIcon icon={faCircleCheck} color="#2ecc71" />;

      return <FontAwesomeIcon icon={faCircleXmark} color="#e74c3c" />;
    }

    return value;
  };

  const rowsToDisplay = data?.productRows
    ? data?.productRows?.[selectedSubscriptionProduct]
    : data?.rows;

  return (
    <div className="mb-6 rounded-lg">
      <div className="mb-4 flex gap-x-0.5 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-1">
        {Object.values(SubscriptionProducts).map((el) => (
          <Button
            variant="outline_bg"
            onClick={() => {
              setSelectedSubscriptionProduct(el);
            }}
            size="xs"
            className={twMerge(
              "min-w-[2.4rem] flex-1 rounded border-none capitalize hover:bg-mineshaft-600",
              selectedSubscriptionProduct === el ? "bg-mineshaft-500" : "bg-transparent"
            )}
          >
            {el.split("-").join(" ")}
          </Button>
        ))}
      </div>
      <PlanUsageStats selectedProduct={selectedSubscriptionProduct} orgPlan={data} />
      <TableContainer className="mt-4">
        <Table>
          <THead>
            <Tr>
              <Th className="w-1/3">Feature</Th>
              <Th className="w-1/3">Allowed</Th>
              <Th className="w-1/3">Used</Th>
            </Tr>
          </THead>
          <TBody>
            {!isPending &&
              data &&
              rowsToDisplay?.length &&
              rowsToDisplay?.map(({ name, allowed, used }) => {
                let toolTipText = null;
                if (name === "Organization identity limit") {
                  toolTipText =
                    "Identity count is calculated by the total number of user identities and machine identities.";
                }

                return (
                  <Tr key={`current-plan-row-${name}`} className="h-12">
                    <Td>
                      <div className="flex items-center">
                        {name}
                        {toolTipText && (
                          <Tooltip content={toolTipText}>
                            <FontAwesomeIcon icon={faInfoCircle} className="ml-2" size="xs" />
                          </Tooltip>
                        )}
                      </div>
                    </Td>
                    <Td>{displayCell(allowed)}</Td>
                    <Td>{used}</Td>
                  </Tr>
                );
              })}
            {isPending && <TableSkeleton columns={5} innerKey="invoices" />}
            {!isPending && data && data?.rows?.length === 0 && (
              <Tr>
                <Td colSpan={3}>
                  <EmptyState title="No plan details found" icon={faFileInvoice} />
                </Td>
              </Tr>
            )}
          </TBody>
        </Table>
      </TableContainer>
    </div>
  );
};
