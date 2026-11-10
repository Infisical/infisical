import { useQuery } from "@tanstack/react-query";

import { useListGatewayPools } from "@app/hooks/api/gateway-pools/queries";
import { gatewaysQueryKeys } from "@app/hooks/api/gateways/queries";
import {
  useCreateHsmConnector,
  useDeleteHsmConnector,
  useTestHsmConnector,
  useUpdateHsmConnector
} from "@app/hooks/api/hsmConnectors/mutations";
import { useListHsmConnectors } from "@app/hooks/api/hsmConnectors/queries";
import { useGetOrganizationById } from "@app/hooks/api/organization/queries";
import { useGetOrgSubscription } from "@app/hooks/api/subscriptions/queries";

import type { CertManagerHsmAdapter } from "./contract-hsm";

export const hsmLive: CertManagerHsmAdapter = {
  useHsmPlan: (orgId) => {
    const subscription = useGetOrgSubscription({ orgID: orgId });
    const organization = useGetOrganizationById(orgId);
    return {
      data:
        subscription.data && organization.data
          ? {
              hsm: Boolean(subscription.data.hsm),
              gatewayPool: Boolean(subscription.data.gatewayPool),
              requireGatewayPools: Boolean(organization.data.requireGatewayPools)
            }
          : undefined,
      isPending: subscription.isPending || organization.isPending,
      error: subscription.error ?? organization.error
    };
  },
  useHsmConnectors: (options) => useListHsmConnectors(options),
  useHsmGateways: (options) => useQuery({ ...gatewaysQueryKeys.list(), ...options }),
  useHsmAllGateways: (options) => useQuery({ ...gatewaysQueryKeys.listAll(), ...options }),
  useHsmGatewayPools: (options) => useListGatewayPools(options),
  useCreateHsmConnector,
  useUpdateHsmConnector,
  useDeleteHsmConnector,
  useTestHsmConnector
};
