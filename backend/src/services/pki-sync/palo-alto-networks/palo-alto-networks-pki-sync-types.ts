import { z } from "zod";

import {
  PaloAltoNetworksPkiSyncConfigSchema,
  PaloAltoNetworksPkiSyncOptionsSchema,
  PaloAltoNetworksSslTlsProfilePkiSyncConfigSchema
} from "./palo-alto-networks-pki-sync-schemas";

export type TPaloAltoNetworksPkiSyncOptions = z.infer<typeof PaloAltoNetworksPkiSyncOptionsSchema>;

export type TPaloAltoNetworksPkiSyncConfig = z.infer<typeof PaloAltoNetworksPkiSyncConfigSchema> &
  Partial<
    Pick<
      z.infer<typeof PaloAltoNetworksSslTlsProfilePkiSyncConfigSchema>,
      "sslTlsServiceProfileName" | "sslTlsServiceProfileVsys"
    >
  >;
