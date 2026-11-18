import { TableName, TCertificates, TCertificatesInsert } from "@app/db/schemas";
import { daysToMillisecond } from "@app/lib/dates";
import { CertStatus } from "@app/services/certificate/certificate-types";

export const insertCertificate = async (
  values: Omit<TCertificatesInsert, "status" | "notBefore" | "notAfter"> & Partial<TCertificatesInsert>
) => {
  const now = Date.now();
  const [certificate] = await testDb(TableName.Certificate)
    .insert({
      status: CertStatus.ACTIVE,
      notBefore: new Date(now - daysToMillisecond(1)),
      notAfter: new Date(now + daysToMillisecond(30)),
      ...values
    })
    .returning("*");
  return certificate as TCertificates;
};
