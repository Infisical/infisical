import type { SelectOption } from "@infisical/cipher/ui/select";

import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { CertKeySource } from "@app/hooks/api/signers/types";

import { providerMedia } from "../../components/provider-label";

export const hsmKeySourceReason = (isHsmLicensed: boolean, canAttach: boolean) => {
  if (!isHsmLicensed) return "Enterprise plan";
  return canAttach ? undefined : "Requires permission to attach HSM connectors";
};

export const keySourceOptions = ({
  hsmReason,
  requiresHsm,
  awsKms
}: {
  hsmReason?: string;
  requiresHsm?: boolean;
  awsKms?: { available: boolean };
}): SelectOption[] => [
  { value: CertKeySource.Infisical, label: "Infisical", disabled: requiresHsm },
  { value: CertKeySource.Hsm, label: "HSM", disabled: Boolean(hsmReason), description: hsmReason },
  ...(awsKms
    ? [
        {
          value: CertKeySource.AwsKms,
          label: "AWS KMS",
          media: providerMedia("app-connection", AppConnection.AWS),
          disabled: !awsKms.available,
          meta: awsKms.available ? undefined : "Enterprise plan"
        }
      ]
    : [])
];
