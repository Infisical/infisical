import { CodeBlock } from "@infisical/cipher/ui/code-block";
import { Grid } from "@infisical/cipher/ui/layout";

import { PkiSync } from "@app/hooks/api/pkiSyncs/enums";

import { TextField, useWatchedValue } from "../fields";

type TFieldMappings = {
  certificate?: string;
  privateKey?: string;
  certificateChain?: string;
  caCertificate?: string;
};

const MAPPED_FIELDS = [
  {
    key: "certificate",
    label: "Certificate field",
    content: "certificate",
    fallback: "certificate"
  },
  {
    key: "privateKey",
    label: "Private key field",
    content: "private key",
    fallback: "private_key"
  },
  {
    key: "certificateChain",
    label: "Certificate chain field",
    content: "certificate chain",
    fallback: "certificate_chain"
  },
  {
    key: "caCertificate",
    label: "CA certificate field",
    content: "CA certificate",
    fallback: "ca_certificate"
  }
] as const;

export const FIELD_MAPPING_DESTINATIONS: PkiSync[] = [PkiSync.Chef, PkiSync.AwsSecretsManager];

export function PkiSyncFieldMappingsFields({ destination }: { destination?: PkiSync }) {
  const watchedDestination = useWatchedValue<PkiSync>("destination");
  const fieldMappings = useWatchedValue<TFieldMappings | undefined>("syncOptions.fieldMappings");
  const currentDestination = destination || watchedDestination;

  if (!FIELD_MAPPING_DESTINATIONS.includes(currentDestination)) return null;

  const store = currentDestination === PkiSync.Chef ? "Chef data bag item" : "AWS secret";
  const nameOf = (key: keyof TFieldMappings, fallback: string) => fieldMappings?.[key] || fallback;

  return (
    <>
      <Grid columns={2} gap={12}>
        {MAPPED_FIELDS.map(({ key, label, content, fallback }) => (
          <TextField
            key={key}
            name={`syncOptions.fieldMappings.${key}`}
            label={label}
            help={`The field name used to store the ${content} content in the ${store}.`}
            placeholder={fallback}
          />
        ))}
      </Grid>
      <CodeBlock
        label="Preview"
        language="json"
        code={`{
  "id": "certificate-item-name",
  "${nameOf("certificate", "certificate")}": "<certificate-content>",
  "${nameOf("privateKey", "private_key")}": "<private-key-content>",
  "${nameOf("certificateChain", "certificate_chain")}": "<certificate-chain-content>",
  "${nameOf("caCertificate", "ca_certificate")}": "<ca-certificate-content>"
}`}
      />
    </>
  );
}
