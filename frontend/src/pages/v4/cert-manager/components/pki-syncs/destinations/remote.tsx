import { useFormContext, useWatch } from "react-hook-form";
import { Stack } from "@infisical/cipher/ui/layout";

import type { TPkiSyncForm } from "@app/components/pki-syncs/forms/schemas/pki-sync-schema";
import { PkiSync } from "@app/hooks/api/pkiSyncs/enums";
import type { TKempVirtualService } from "@app/hooks/api/pkiSyncs/types";

import { useV4Adapter } from "../../../../data/adapters";
import { PkiSyncConnectionField } from "../connection-field";
import { fetchErrorOf, ListField } from "./list-field";

type FormOf<D extends PkiSync> = TPkiSyncForm & { destination: D };

const connectionPlaceholder = (connectionId: string | undefined, placeholder: string) =>
  connectionId ? placeholder : "Select a connection first";

export function CloudflareCustomCertificateFields() {
  const { control, setValue } = useFormContext<FormOf<PkiSync.CloudflareCustomCertificate>>();
  const connectionId = useWatch({ control, name: "connection.id" });
  const enabled = Boolean(connectionId);
  const zones = useV4Adapter("pkiSyncs").useCloudflareZones(connectionId ?? "", { enabled });

  return (
    <Stack gap={16}>
      <PkiSyncConnectionField onChange={() => setValue("destinationConfig.zoneId", "")} />
      <ListField
        name="destinationConfig.zoneId"
        label="Zone"
        help="The Cloudflare zone (domain) the custom SSL certificate is uploaded to."
        options={(zones.data ?? []).map((zone) => ({
          value: zone.id,
          label: zone.name,
          meta: zone.id
        }))}
        loading={zones.isPending && enabled}
        disabled={!connectionId}
        placeholder={connectionPlaceholder(connectionId, "Select a zone")}
        emptyText="No zones found."
      />
    </Stack>
  );
}

const virtualServiceLabel = (virtualService: TKempVirtualService) =>
  virtualService.name
    ? `${virtualService.name} (${virtualService.address}:${virtualService.port})`
    : `${virtualService.address}:${virtualService.port}`;

export function KempLoadMasterFields() {
  const { control, setValue } = useFormContext<FormOf<PkiSync.KempLoadMaster>>();
  const connectionId = useWatch({ control, name: "connection.id" });
  const enabled = Boolean(connectionId);
  const virtualServices = useV4Adapter("pkiSyncs").useKempVirtualServices(
    { connectionId },
    { enabled }
  );

  return (
    <Stack gap={16}>
      <PkiSyncConnectionField
        onChange={() => setValue("destinationConfig.virtualServiceId", undefined)}
      />
      <ListField
        name="destinationConfig.virtualServiceId"
        label="Virtual service"
        optional
        clearable
        help="The Virtual Service to bind the certificate to. Leave unset to only import the certificate."
        options={(virtualServices.data ?? []).map((virtualService) => ({
          value: virtualService.id,
          label: virtualServiceLabel(virtualService),
          meta: virtualService.id
        }))}
        loading={virtualServices.isPending && enabled}
        disabled={!connectionId}
        placeholder={connectionPlaceholder(connectionId, "Leave unset to import certificate only")}
        emptyText="No virtual services found."
        onSelect={(value) => {
          if (!value) setValue("destinationConfig.virtualServiceId", undefined);
        }}
      />
    </Stack>
  );
}

export function ImpervaFields() {
  const { control, setValue } = useFormContext<FormOf<PkiSync.Imperva>>();
  const connectionId = useWatch({ control, name: "connection.id" });
  const siteName = useWatch({ control, name: "destinationConfig.siteName" });
  const enabled = Boolean(connectionId);
  const sites = useV4Adapter("pkiSyncs").useImpervaSites({ connectionId }, { enabled });

  return (
    <Stack gap={16}>
      <PkiSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.siteId", "");
          setValue("destinationConfig.siteName", "");
        }}
      />
      <ListField
        name="destinationConfig.siteId"
        label="Website"
        help="The Imperva website that receives the custom certificate. Imperva holds one custom certificate per website, so this sync carries a single certificate."
        options={(sites.data ?? []).map((site) => ({
          value: site.id,
          label: site.name,
          meta: site.id
        }))}
        currentLabel={siteName}
        loading={sites.isPending && enabled}
        fetchError={fetchErrorOf(
          sites,
          enabled,
          "Failed to fetch websites. Check connection settings."
        )}
        disabled={!connectionId}
        placeholder={connectionPlaceholder(connectionId, "Select a website")}
        emptyText="No websites found."
        onSelect={(siteId) =>
          setValue(
            "destinationConfig.siteName",
            sites.data?.find((site) => site.id === siteId)?.name ?? ""
          )
        }
      />
    </Stack>
  );
}

export function NutanixPrismCentralFields() {
  const { control, setValue } = useFormContext<FormOf<PkiSync.NutanixPrismCentral>>();
  const connectionId = useWatch({ control, name: "connection.id" });
  const clusterName = useWatch({ control, name: "destinationConfig.clusterName" });
  const enabled = Boolean(connectionId);
  const clusters = useV4Adapter("pkiSyncs").useNutanixClusters(connectionId, { enabled });
  const loading = clusters.isPending && enabled;

  return (
    <Stack gap={16}>
      <PkiSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.clusterId", "");
          setValue("destinationConfig.clusterName", "");
        }}
      />
      <ListField
        name="destinationConfig.clusterId"
        label="Target cluster"
        help="The Nutanix cluster that receives the certificate."
        options={(clusters.data ?? []).map((cluster) => ({
          value: cluster.id,
          label: cluster.name,
          meta: cluster.id
        }))}
        currentLabel={clusterName}
        loading={loading}
        fetchError={fetchErrorOf(
          clusters,
          enabled,
          "Failed to fetch clusters. Check connection settings."
        )}
        disabled={!connectionId || loading}
        placeholder={connectionPlaceholder(connectionId, "Select a cluster")}
        emptyText="No clusters found."
        onSelect={(clusterId) =>
          setValue(
            "destinationConfig.clusterName",
            clusters.data?.find((cluster) => cluster.id === clusterId)?.name ?? ""
          )
        }
      />
    </Stack>
  );
}
