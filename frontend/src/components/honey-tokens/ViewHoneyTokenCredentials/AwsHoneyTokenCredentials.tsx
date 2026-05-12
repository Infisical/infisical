import { TAwsHoneyToken } from "@app/hooks/api/honeyTokens/types";

import { CredentialField } from "./CredentialField";

type Props = {
  secretsMapping: TAwsHoneyToken["secretsMapping"];
  credentials: Record<string, string>;
};

const CREDENTIAL_FIELDS: { key: keyof TAwsHoneyToken["secretsMapping"]; label: string }[] = [
  { key: "accessKeyId", label: "Access Key ID" },
  { key: "secretAccessKey", label: "Secret Access Key" }
];

export const AwsHoneyTokenCredentials = ({ secretsMapping, credentials }: Props) => {
  return (
    <div className="flex flex-col gap-4">
      {CREDENTIAL_FIELDS.map(({ key, label }) => {
        const secretName = secretsMapping[key];
        const value = (secretName ? credentials[secretName] : undefined) ?? credentials[key];

        return <CredentialField key={key} label={label} value={value} />;
      })}
    </div>
  );
};
