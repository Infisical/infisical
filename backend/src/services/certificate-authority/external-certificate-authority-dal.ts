import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

import { CaType } from "./certificate-authority-enums";

export type TExternalCertificateAuthorityDALFactory = ReturnType<typeof externalCertificateAuthorityDALFactory>;

export const externalCertificateAuthorityDALFactory = (db: TDbClient) => {
  const caOrm = ormify(db, TableName.ExternalCertificateAuthority);

  const findDigiCertCaNamesByDnsZoneConnectionId = async (connectionId: string) => {
    const cas = await db(TableName.ExternalCertificateAuthority)
      .join(
        TableName.CertificateAuthority,
        `${TableName.ExternalCertificateAuthority}.caId`,
        `${TableName.CertificateAuthority}.id`
      )
      .where(`${TableName.ExternalCertificateAuthority}.type`, CaType.DIGICERT)
      .whereRaw(`"${TableName.ExternalCertificateAuthority}"."configuration"::text LIKE ?`, [`%${connectionId}%`])
      .select<{ name: string; configuration: unknown }[]>(
        db.ref("name").withSchema(TableName.CertificateAuthority),
        db.ref("configuration").withSchema(TableName.ExternalCertificateAuthority)
      );

    return cas
      .filter(({ configuration }) =>
        (configuration as { dnsZones?: { appConnectionId?: string }[] } | null)?.dnsZones?.some(
          (zone) => zone.appConnectionId === connectionId
        )
      )
      .map(({ name }) => name);
  };

  return {
    ...caOrm,
    findDigiCertCaNamesByDnsZoneConnectionId
  };
};
