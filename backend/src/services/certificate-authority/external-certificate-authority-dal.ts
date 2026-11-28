import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

import { CaType } from "./certificate-authority-enums";
import { TDigiCertDnsZone } from "./digicert/digicert-certificate-authority-types";

export type TExternalCertificateAuthorityDALFactory = ReturnType<typeof externalCertificateAuthorityDALFactory>;

export const externalCertificateAuthorityDALFactory = (db: TDbClient) => {
  const caOrm = ormify(db, TableName.ExternalCertificateAuthority);

  const hasDigiCertCaLinkingDnsZoneConnection = async (connectionId: string, tx?: Knex) => {
    const candidates = await (tx || db)(TableName.ExternalCertificateAuthority)
      .where({ type: CaType.DIGICERT })
      .whereRaw(`"configuration"::text LIKE ?`, [`%${connectionId}%`])
      .select<{ configuration: unknown }[]>("configuration");

    return candidates.some(({ configuration }) =>
      (configuration as { dnsZones?: { appConnectionId?: string }[] } | null)?.dnsZones?.some(
        (zone) => zone.appConnectionId === connectionId
      )
    );
  };

  const findDigiCertConfigurationForUpdate = async (caId: string, tx: Knex) => {
    const externalCa = await tx(TableName.ExternalCertificateAuthority)
      .where({ caId, type: CaType.DIGICERT })
      .forUpdate()
      .first<{ appConnectionId: string | null; configuration: unknown } | undefined>(
        "appConnectionId",
        "configuration"
      );
    if (!externalCa) return undefined;
    const configuration = externalCa.configuration as {
      organizationId?: number;
      dnsZones?: TDigiCertDnsZone[];
    } | null;
    return {
      appConnectionId: externalCa.appConnectionId,
      organizationId: configuration?.organizationId,
      dnsZones: configuration?.dnsZones
    };
  };

  return {
    ...caOrm,
    findDigiCertConfigurationForUpdate,
    hasDigiCertCaLinkingDnsZoneConnection
  };
};
