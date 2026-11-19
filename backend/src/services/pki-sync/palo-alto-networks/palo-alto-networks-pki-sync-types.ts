import { z } from "zod";

import {
  PaloAltoNetworksPkiSyncConfigSchema,
  PaloAltoNetworksPkiSyncOptionsSchema,
  PaloAltoNetworksSslTlsProfilePkiSyncConfigSchema,
  PaloAltoNetworksSslTlsProfileRemovalOptionsSchema
} from "./palo-alto-networks-pki-sync-schemas";

export type TPaloAltoNetworksPkiSyncOptions = z.infer<typeof PaloAltoNetworksPkiSyncOptionsSchema>;

export type TPaloAltoNetworksPkiSyncConfig = z.infer<typeof PaloAltoNetworksPkiSyncConfigSchema> &
  Partial<
    Pick<
      z.infer<typeof PaloAltoNetworksSslTlsProfilePkiSyncConfigSchema>,
      "sslTlsServiceProfileName" | "sslTlsServiceProfileVsys"
    >
  >;

export type TPaloAltoNetworksSslTlsProfileRemovalOptions = z.infer<
  typeof PaloAltoNetworksSslTlsProfileRemovalOptionsSchema
>;
