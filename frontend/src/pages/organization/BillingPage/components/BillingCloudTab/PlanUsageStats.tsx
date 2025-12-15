import { HelpCircleIcon } from "lucide-react";

import { OrgPermissionCan } from "@app/components/permissions";
import {
  Button,
  Card,
  CardBody,
  CardTitle,
  Modal,
  ModalContent,
  Table,
  TableContainer,
  TBody,
  Td,
  Th,
  THead,
  Tooltip,
  Tr
} from "@app/components/v2";
import {
  OrgPermissionBillingActions,
  OrgPermissionSubjects,
  useOrganization,
  useSubscription
} from "@app/context";
import { isInfisicalCloud } from "@app/helpers/platform";
import { usePopUp } from "@app/hooks";
import { useCreateCustomerPortalSession, useGetOrgBillingMetrics } from "@app/hooks/api";
import { OrgPlanTable } from "@app/hooks/api/organization/types";
import { SubscriptionProducts } from "@app/hooks/api/types";

import { ManagePlansTable } from "./ManagePlansTable";

type Props = {
  selectedProduct: SubscriptionProducts;
  orgPlan?: OrgPlanTable;
};

export const PlanUsageStats = ({ selectedProduct, orgPlan }: Props) => {
  const { subscription } = useSubscription();
  const { popUp, handlePopUpOpen, handlePopUpToggle, handlePopUpClose } = usePopUp(["managePlan"]);
  const { currentOrg } = useOrganization();
  const { data: billingMetrics, isPending: isBillingMetricsPending } = useGetOrgBillingMetrics(
    currentOrg.id
  );
  const createCustomerPortalSession = useCreateCustomerPortalSession();

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex-1 rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-4">
        <p className="mb-2 text-gray-400">Current plan</p>
        <p className="mb-8 text-2xl font-medium text-mineshaft-50 capitalize">
          {subscription?.version === 1
            ? subscription?.slug
            : subscription?.productPlans?.[selectedProduct]?.split("-").join(" ") || "-"}
        </p>
        {isInfisicalCloud() && (
          <OrgPermissionCan
            I={OrgPermissionBillingActions.ManageBilling}
            a={OrgPermissionSubjects.Billing}
          >
            {(isAllowed) => (
              <div className="flex justify-between">
                <Button
                  variant="plain"
                  colorSchema="secondary"
                  type="button"
                  onClick={async () => {
                    handlePopUpOpen("managePlan");
                  }}
                  disabled={!isAllowed}
                  className="text-primary"
                >
                  Manage plan &rarr;
                </Button>
                <Button
                  variant="plain"
                  colorSchema="secondary"
                  type="button"
                  onClick={async () => {
                    if (!currentOrg?.id) return;
                    const { url } = await createCustomerPortalSession.mutateAsync(currentOrg.id);
                    window.location.href = url;
                  }}
                  disabled={!isAllowed}
                  isLoading={createCustomerPortalSession.isPending}
                >
                  Update Card
                </Button>
              </div>
            )}
          </OrgPermissionCan>
        )}
      </div>
      <div>
        {selectedProduct !== SubscriptionProducts.CertificateManager && (
          <Card>
            <CardTitle className="mb-0 flex items-center px-5">
              Total Identity Seats
              <Tooltip content="Assigned Explanation">
                <HelpCircleIcon className="ml-2 text-gray-400" size={16} />
              </Tooltip>
            </CardTitle>
            <CardBody className="p-0">
              <Table>
                <TBody>
                  <Tr>
                    <Td>Assigned</Td>
                    <Td>1</Td>
                  </Tr>
                  <Tr>
                    <Td>Available</Td>
                    <Td>0</Td>
                  </Tr>
                </TBody>
              </Table>
            </CardBody>
          </Card>
        )}
        {selectedProduct === SubscriptionProducts.CertificateManager && (
          <TableContainer>
            <Table>
              <THead>
                <Tr>
                  <Th>Resource</Th>
                  <Th>Usage</Th>
                </Tr>
              </THead>
              <TBody>
                <Tr>
                  <Td>Certificate SANs</Td>
                  <Td>{Number(billingMetrics?.certificateMetrics?.sanCount)}</Td>
                </Tr>
                <Tr>
                  <Td>Certificate Wildcards</Td>
                  <Td>{Number(billingMetrics?.certificateMetrics?.wildcardCount)}</Td>
                </Tr>
                <Tr>
                  <Td>Internal CA</Td>
                  <Td>{Number(billingMetrics?.usedCertManagerCas)}</Td>
                </Tr>
              </TBody>
            </Table>
          </TableContainer>
        )}
      </div>
      <Modal
        isOpen={popUp.managePlan.isOpen}
        onOpenChange={(open) => handlePopUpToggle("managePlan", open)}
      >
        <ModalContent
          titleClassName="capitalize"
          title={`Manage ${selectedProduct.split("-").join(" ")} plan`}
          subTitle="Upgrade to pro plan to unlock more exciting features or contact sales to obtain enterprise plan"
          className="max-w-7xl"
        >
          <ManagePlansTable
            selectedProduct={selectedProduct}
            onClose={() => handlePopUpClose("managePlan")}
          />
        </ModalContent>
      </Modal>
    </div>
  );
};
