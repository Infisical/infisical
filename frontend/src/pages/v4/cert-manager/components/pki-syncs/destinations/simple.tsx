import { useEffect } from "react";
import { Field } from "@infisical/cipher/ui/field";
import { Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";

import { F5BigIpProfileType } from "@app/hooks/api/pkiSyncs/types/f5-big-ip-sync";

import { PkiSyncConnectionField } from "../connection-field";
import { SwitchField, TextField, useDraftField, useDraftValue, usePkiSyncDraft } from "../fields";

export function AzureKeyVaultFields() {
  const { setValue } = usePkiSyncDraft();
  return (
    <Stack gap={16}>
      <PkiSyncConnectionField onChange={() => setValue("destinationConfig.vaultBaseUrl", "")} />
      <TextField
        name="destinationConfig.vaultBaseUrl"
        label="Vault base URL"
        help="The base URL of your Azure Key Vault, for example https://example.vault.azure.net."
        placeholder="https://example.vault.azure.net"
      />
    </Stack>
  );
}

export function ChefFields() {
  const { setValue } = usePkiSyncDraft();
  return (
    <Stack gap={16}>
      <PkiSyncConnectionField onChange={() => setValue("destinationConfig.dataBagName", "")} />
      <TextField
        name="destinationConfig.dataBagName"
        label="Data bag name"
        help="The Chef data bag that stores the certificates, private keys and certificate chains. Use only letters, numbers, underscores and hyphens."
        placeholder="ssl_certificates"
        maxLength={255}
      />
    </Stack>
  );
}

export function NetScalerFields() {
  return (
    <Stack gap={16}>
      <PkiSyncConnectionField />
      <TextField
        name="destinationConfig.vserverName"
        label="SSL vServer name"
        optional
        help="The SSL virtual server to bind the certificate to. Leave empty to only upload the certificate without binding."
        placeholder="e.g. vs-ssl-prod"
      />
    </Stack>
  );
}

export function DestinationPathFields({
  help,
  placeholder
}: {
  help: string;
  placeholder: string;
}) {
  return (
    <Stack gap={16}>
      <PkiSyncConnectionField />
      <TextField
        name="destinationConfig.destinationPath"
        label="Destination directory"
        help={help}
        placeholder={placeholder}
        mono
      />
    </Stack>
  );
}

const PROFILE_TYPE_OPTIONS = [
  { value: F5BigIpProfileType.None, label: "None" },
  { value: F5BigIpProfileType.ClientSsl, label: "Client SSL profile" },
  { value: F5BigIpProfileType.ServerSsl, label: "Server SSL profile" }
];

export function F5BigIpFields() {
  const { setValue } = usePkiSyncDraft();
  const profileTypeField = useDraftField<F5BigIpProfileType | undefined>(
    "destinationConfig.profileType"
  );
  const profileType = profileTypeField.value;
  const createProfileIfMissing = useDraftValue<boolean | undefined>(
    "destinationConfig.createProfileIfMissing"
  );
  const requiresProfile = profileType !== undefined && profileType !== F5BigIpProfileType.None;
  const isServer = profileType === F5BigIpProfileType.ServerSsl;

  useEffect(() => {
    if (requiresProfile) return;
    setValue("destinationConfig.profileName", undefined);
    if (createProfileIfMissing) setValue("destinationConfig.createProfileIfMissing", false);
    setValue("destinationConfig.parentProfile", undefined);
  }, [requiresProfile, createProfileIfMissing, setValue]);

  useEffect(() => {
    if (!createProfileIfMissing) setValue("destinationConfig.parentProfile", undefined);
  }, [createProfileIfMissing, setValue]);

  return (
    <Stack gap={16}>
      <PkiSyncConnectionField />
      <TextField
        name="destinationConfig.partition"
        label="Partition"
        optional
        help="The F5 partition where certificates are stored. Defaults to Common."
        placeholder="Common"
      />
      <Field
        label="Profile binding"
        help="Attach each synced certificate to a Client SSL or Server SSL profile so the BIG-IP starts using it right away. F5 allows one certificate per algorithm type (RSA, ECDSA, DSA) per profile, so use separate profiles for several certificates of the same type. Choose None to only upload certificates."
        error={profileTypeField.error}
      >
        <Select
          aria-label="Profile binding"
          value={profileType ?? F5BigIpProfileType.None}
          onValueChange={(value) => profileTypeField.onChange(value as F5BigIpProfileType)}
          options={PROFILE_TYPE_OPTIONS}
          invalid={Boolean(profileTypeField.error)}
        />
      </Field>
      {requiresProfile && (
        <>
          <TextField
            name="destinationConfig.profileName"
            label={isServer ? "Server SSL profile name" : "Client SSL profile name"}
            help="The SSL profile inside the partition. Infisical adds each synced certificate to it."
            placeholder={isServer ? "e.g. backend-ssl" : "e.g. clientssl-prod"}
          />
          <SwitchField
            name="destinationConfig.createProfileIfMissing"
            label="Create profile if missing"
            description="Creates the SSL profile on the BIG-IP when it doesn't exist yet. Off by default, since F5 administrators usually manage production profiles."
          />
          {createProfileIfMissing && (
            <TextField
              name="destinationConfig.parentProfile"
              label="Parent profile"
              optional
              help={`The existing F5 profile whose settings the new profile copies. Defaults to /Common/${isServer ? "serverssl" : "clientssl"}. Enter a name (looked up in /Common) or a full path like /MyPartition/my-parent.`}
              placeholder={isServer ? "/Common/serverssl" : "/Common/clientssl"}
            />
          )}
        </>
      )}
    </Stack>
  );
}
