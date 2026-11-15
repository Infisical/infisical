import {
  useGetHsmConnectorById,
  useListHsmConnectorLinkedResources
} from "@app/hooks/api/hsmConnectors/queries";

import type { HsmConnectorsAdapter } from "./contract";

export const hsmConnectorsLive: HsmConnectorsAdapter = {
  useHsmConnector: useGetHsmConnectorById,
  useLinkedResources: useListHsmConnectorLinkedResources
};
