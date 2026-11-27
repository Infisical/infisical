import { TSignerWithCertificate } from "./signer-dal";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const isSignerRenewalDue = (
  signer: Pick<TSignerWithCertificate, "certificateRenewBeforeDays" | "certificateNotAfter">,
  now: number
) => {
  const renewBeforeDays = signer.certificateRenewBeforeDays ?? 0;
  return (
    renewBeforeDays >= 1 &&
    (!signer.certificateNotAfter || signer.certificateNotAfter.getTime() - now <= renewBeforeDays * MS_PER_DAY)
  );
};
