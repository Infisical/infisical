import { useState } from "react";
import { Code } from "@infisical/cipher/ui/code";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { Switch } from "@infisical/cipher/ui/switch";
import { Textarea } from "@infisical/cipher/ui/textarea";

import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { PkiSync } from "@app/hooks/api/pkiSyncs/enums";
import { useDebounce } from "@app/hooks/useDebounce";

import { useV4Adapter } from "../../../../data/adapters";
import { useDraftField, useDraftValue } from "../fields";
import { useCanSetTargetHost } from "../shared";
import { withCurrent } from "./list-field";

export function PkiSyncTargetHostField({ applicationId }: { applicationId?: string }) {
  const connection = useDraftValue<{ id?: string; app?: AppConnection } | undefined>("connection");
  const destination = useDraftValue<PkiSync>("destination");
  const host = useDraftField<string | undefined>("destinationConfig.host");
  const port = useDraftField<string | number | undefined>("destinationConfig.port");
  const sslEnabledField = useDraftField<boolean | undefined>("destinationConfig.sslEnabled");
  const sslCertificate = useDraftField<string | undefined>("destinationConfig.sslCertificate");
  const sslRejectUnauthorized = useDraftField<boolean | undefined>(
    "destinationConfig.sslRejectUnauthorized"
  );
  const sshHostKeys = useDraftField<string | undefined>("destinationConfig.sshHostKeys");
  const canSetTargetHost = useCanSetTargetHost(applicationId);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);

  const isLdapConnection = connection?.app === AppConnection.LDAP;
  const sslEnabled = sslEnabledField.value;

  const machines = useV4Adapter("pkiSyncs").useLdapMachines(
    connection?.id ?? "",
    debouncedSearch || undefined,
    { enabled: isLdapConnection && Boolean(connection?.id) }
  );

  if (!isLdapConnection) return null;

  const isListError = Boolean(machines.error);
  const windowsPortHint = sslEnabled ? "5986" : "5985";
  const defaultPortHint = destination === PkiSync.WindowsServer ? windowsPortHint : "22";
  const disabled = !canSetTargetHost;

  return (
    <Stack gap={16}>
      <Field
        label="Target host"
        description={
          isListError ? "The directory could not be listed, so enter the host name." : undefined
        }
        error={host.error}
      >
        {isListError ? (
          <Input
            value={host.value ?? ""}
            onChange={(event) => host.onChange(event.target.value)}
            placeholder="server01.corp.example.com"
            disabled={disabled}
            invalid={Boolean(host.error)}
            mono
            autoComplete="off"
          />
        ) : (
          <Combobox
            label="Target host"
            value={host.value ?? ""}
            onValueChange={(value) => host.onChange(value)}
            onSearch={setSearch}
            onCreate={(query) => host.onChange(query.trim())}
            createLabel={(query) => `Use "${query}"`}
            options={withCurrent(
              (machines.data ?? []).map((machine) => ({
                value: machine.hostname,
                label: machine.hostname
              })),
              host.value
            )}
            loading={machines.isPending}
            placeholder="Select or enter a host"
            emptyText="No machines found."
            disabled={disabled}
            invalid={Boolean(host.error)}
            mono
          />
        )}
      </Field>
      <Field
        label="Port"
        description={`Leave empty to use ${defaultPortHint}. Set a value only if the listener is on a non-standard port.`}
        error={port.error}
      >
        <Input
          type="number"
          value={port.value ?? ""}
          onChange={(event) =>
            port.onChange(event.target.value === "" ? undefined : event.target.value)
          }
          placeholder={defaultPortHint}
          disabled={disabled}
          invalid={Boolean(port.error)}
        />
      </Field>
      {destination === PkiSync.WindowsServer && (
        <>
          <Switch
            label="Enable SSL"
            description="Connect over HTTPS. When disabled, HTTP with NTLM message encryption is used and no server certificate is required."
            checked={Boolean(sslEnabledField.value)}
            onCheckedChange={sslEnabledField.onChange}
            disabled={disabled}
          />
          {sslEnabled && (
            <>
              <Field
                label="SSL certificate"
                description="Leave empty to verify against the system trust store, or paste the listener's certificate to verify a self-signed WinRM HTTPS listener."
                error={sslCertificate.error}
              >
                <Textarea
                  value={(sslCertificate.value as string | undefined) ?? ""}
                  onChange={(event) => sslCertificate.onChange(event.target.value || undefined)}
                  placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
                  rows={6}
                  mono
                  disabled={disabled}
                  aria-invalid={Boolean(sslCertificate.error) || undefined}
                />
              </Field>
              <Switch
                label="Reject unauthorized"
                description="Infisical only connects when the listener presents a valid, trusted certificate."
                checked={sslRejectUnauthorized.value !== false}
                onCheckedChange={sslRejectUnauthorized.onChange}
                disabled={disabled}
              />
            </>
          )}
        </>
      )}
      {destination === PkiSync.LinuxServer && (
        <Field
          label="Trusted host keys"
          optional
          description={
            <>
              The sync only connects when the host presents one of these keys. Paste the output of{" "}
              <Code>ssh-keyscan &lt;host&gt;</Code>.
            </>
          }
          error={sshHostKeys.error}
        >
          <Textarea
            value={(sshHostKeys.value as string | undefined) ?? ""}
            onChange={(event) => sshHostKeys.onChange(event.target.value || undefined)}
            placeholder={"ssh-rsa AAAAB3NzaC1yc2E...\necdsa-sha2-nistp256 AAAAE2VjZHNh..."}
            rows={4}
            mono
            disabled={disabled}
            aria-invalid={Boolean(sshHostKeys.error) || undefined}
          />
        </Field>
      )}
    </Stack>
  );
}
