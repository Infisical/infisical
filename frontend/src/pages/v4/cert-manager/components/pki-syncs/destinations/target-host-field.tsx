import { useState } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import { Code } from "@infisical/cipher/ui/code";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { Switch } from "@infisical/cipher/ui/switch";
import { Textarea } from "@infisical/cipher/ui/textarea";

import type { TPkiSyncForm } from "@app/components/pki-syncs/forms/schemas/pki-sync-schema";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { PkiSync } from "@app/hooks/api/pkiSyncs/enums";
import { useDebounce } from "@app/hooks/useDebounce";

import { useV4Adapter } from "../../../../data/adapters";
import { errorOf } from "../fields";
import { useCanSetTargetHost } from "../shared";
import { withCurrent } from "./list-field";

type TTargetHostForm = TPkiSyncForm & {
  destination: PkiSync.LinuxServer | PkiSync.WindowsServer;
};

export function PkiSyncTargetHostField({ applicationId }: { applicationId?: string }) {
  const { control } = useFormContext<TTargetHostForm>();
  const connection = useWatch({ control, name: "connection" });
  const destination = useWatch({ control, name: "destination" });
  const destinationConfig = useWatch({ control, name: "destinationConfig" });
  const canSetTargetHost = useCanSetTargetHost(applicationId);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);

  const isLdapConnection = connection?.app === AppConnection.LDAP;
  const { sslEnabled } = (destinationConfig ?? {}) as { sslEnabled?: boolean };

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
      <Controller
        control={control}
        name="destinationConfig.host"
        render={({ field, fieldState: { error } }) => (
          <Field
            label="Target host"
            help="The machine this sync delivers to. The LDAP connection supplies the credential, so one connection can serve many hosts."
            description={
              isListError
                ? "The directory could not be listed, so enter the host name."
                : "Choose a machine from the directory, or enter a host this sync should reach."
            }
            error={errorOf(error)}
          >
            {isListError ? (
              <Input
                value={field.value ?? ""}
                onChange={(event) => field.onChange(event.target.value)}
                onBlur={field.onBlur}
                placeholder="server01.corp.example.com"
                disabled={disabled}
                invalid={Boolean(error)}
                mono
                autoComplete="off"
              />
            ) : (
              <Combobox
                label="Target host"
                value={field.value ?? ""}
                onValueChange={(value) => field.onChange(value)}
                onSearch={setSearch}
                onCreate={(query) => field.onChange(query.trim())}
                createLabel={(query) => `Use "${query}"`}
                options={withCurrent(
                  (machines.data ?? []).map((machine) => ({
                    value: machine.hostname,
                    label: machine.hostname
                  })),
                  field.value
                )}
                loading={machines.isPending}
                placeholder="Select or enter a host"
                emptyText="No machines found."
                disabled={disabled}
                invalid={Boolean(error)}
                mono
              />
            )}
          </Field>
        )}
      />
      <Controller
        control={control}
        name="destinationConfig.port"
        render={({ field, fieldState: { error } }) => (
          <Field
            label="Port"
            description={`Leave empty to use ${defaultPortHint}. Set a value only if the listener is on a non-standard port.`}
            error={errorOf(error)}
          >
            <Input
              type="number"
              value={field.value ?? ""}
              onChange={(event) =>
                field.onChange(event.target.value === "" ? undefined : event.target.value)
              }
              onBlur={field.onBlur}
              placeholder={defaultPortHint}
              disabled={disabled}
              invalid={Boolean(error)}
            />
          </Field>
        )}
      />
      {destination === PkiSync.WindowsServer && (
        <>
          <Controller
            control={control}
            name="destinationConfig.sslEnabled"
            render={({ field }) => (
              <Switch
                label="Enable SSL"
                description="Connect over HTTPS. When disabled, HTTP with NTLM message encryption is used and no server certificate is required."
                checked={Boolean(field.value)}
                onCheckedChange={field.onChange}
                disabled={disabled}
              />
            )}
          />
          {sslEnabled && (
            <>
              <Controller
                control={control}
                name="destinationConfig.sslCertificate"
                render={({ field, fieldState: { error } }) => (
                  <Field
                    label="SSL certificate"
                    description="Leave empty to verify against the system trust store, or paste the listener's certificate to verify a self-signed WinRM HTTPS listener."
                    error={errorOf(error)}
                  >
                    <Textarea
                      value={(field.value as string | undefined) ?? ""}
                      onChange={(event) => field.onChange(event.target.value || undefined)}
                      onBlur={field.onBlur}
                      placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
                      rows={6}
                      mono
                      disabled={disabled}
                      aria-invalid={Boolean(error) || undefined}
                    />
                  </Field>
                )}
              />
              <Controller
                control={control}
                name="destinationConfig.sslRejectUnauthorized"
                render={({ field }) => (
                  <Switch
                    label="Reject unauthorized"
                    description="Infisical only connects when the listener presents a valid, trusted certificate."
                    checked={field.value !== false}
                    onCheckedChange={field.onChange}
                    disabled={disabled}
                  />
                )}
              />
            </>
          )}
        </>
      )}
      {destination === PkiSync.LinuxServer && (
        <Controller
          control={control}
          name="destinationConfig.sshHostKeys"
          render={({ field, fieldState: { error } }) => (
            <Field
              label="Trusted host keys"
              optional
              description={
                <>
                  The sync only connects when the host presents one of these keys. Paste the output
                  of <Code>ssh-keyscan &lt;host&gt;</Code>.
                </>
              }
              error={errorOf(error)}
            >
              <Textarea
                value={(field.value as string | undefined) ?? ""}
                onChange={(event) => field.onChange(event.target.value || undefined)}
                onBlur={field.onBlur}
                placeholder={"ssh-rsa AAAAB3NzaC1yc2E...\necdsa-sha2-nistp256 AAAAE2VjZHNh..."}
                rows={4}
                mono
                disabled={disabled}
                aria-invalid={Boolean(error) || undefined}
              />
            </Field>
          )}
        />
      )}
    </Stack>
  );
}
