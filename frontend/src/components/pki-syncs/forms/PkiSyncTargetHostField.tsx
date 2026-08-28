import { useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { Info } from "lucide-react";

import {
  CreatableSelect,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
  Input,
  Switch,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useDebounce } from "@app/hooks";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { useLdapConnectionListMachines } from "@app/hooks/api/appConnections/ldap";
import { PkiSync } from "@app/hooks/api/pkiSyncs";
import { useCanSetTargetHost } from "@app/hooks/api/pkiSyncs/usePkiSyncPermissions";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";

type Props = {
  applicationId?: string | null;
};

export const PkiSyncTargetHostField = ({ applicationId }: Props) => {
  const { control, watch } = useFormContext<
    TPkiSyncForm & { destination: PkiSync.LinuxServer | PkiSync.WindowsServer }
  >();

  const connection = watch("connection");
  const destination = watch("destination");
  const canSetTargetHost = useCanSetTargetHost(applicationId);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search, 300);

  const isLdapConnection = connection?.app === AppConnection.LDAP;
  const { sslEnabled } = (watch("destinationConfig") ?? {}) as { sslEnabled?: boolean };

  const {
    data: machines,
    isPending,
    isError
  } = useLdapConnectionListMachines(connection?.id ?? "", debouncedSearch || undefined, {
    enabled: isLdapConnection && Boolean(connection?.id)
  });

  if (!isLdapConnection) return null;

  const windowsPortHint = sslEnabled ? "5986" : "5985";
  const defaultPortHint = destination === PkiSync.WindowsServer ? windowsPortHint : "22";

  const options = (machines ?? []).map((machine) => ({
    value: machine.hostname,
    label: machine.hostname
  }));

  const hostField = (
    <Controller
      name="destinationConfig.host"
      control={control}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <Field className="mb-4">
          <FieldLabel>
            Target Host
            <Tooltip>
              <TooltipTrigger asChild>
                <Info />
              </TooltipTrigger>
              <TooltipContent className="max-w-sm">
                The machine this sync delivers to. The LDAP connection supplies the credential, so
                one connection can serve many hosts.
              </TooltipContent>
            </Tooltip>
          </FieldLabel>
          {isError ? (
            <Input
              value={value ?? ""}
              onChange={(event) => onChange(event.target.value)}
              placeholder="server01.corp.example.com"
              disabled={!canSetTargetHost}
              isError={Boolean(error)}
            />
          ) : (
            <CreatableSelect
              value={value ? { value, label: value } : null}
              onChange={(newValue) => onChange((newValue as { value: string } | null)?.value ?? "")}
              onCreateOption={(inputValue) => onChange(inputValue.trim())}
              onInputChange={(inputValue) => setSearch(inputValue)}
              options={options}
              isLoading={isPending}
              isClearable
              noOptionsMessage={() => "No machines match search"}
              placeholder="Select or enter a host..."
              isDisabled={!canSetTargetHost}
              isError={Boolean(error)}
            />
          )}
          <FieldError errors={[error]} />
          {!error && (
            <FieldDescription>
              {isError
                ? "The directory could not be listed, so enter the host name."
                : "Choose a machine from the directory, or enter a host this sync should reach."}
            </FieldDescription>
          )}
        </Field>
      )}
    />
  );

  return (
    <>
      {hostField}
      <Controller
        name="destinationConfig.port"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>Port</FieldLabel>
            <Input
              type="number"
              value={value ?? ""}
              onChange={(event) =>
                onChange(event.target.value === "" ? undefined : event.target.value)
              }
              placeholder={defaultPortHint}
              disabled={!canSetTargetHost}
              isError={Boolean(error)}
            />
            <FieldError errors={[error]} />
            {!error && (
              <FieldDescription>
                Leave empty to use {defaultPortHint}. Set a value only if the listener is on a
                non-standard port.
              </FieldDescription>
            )}
          </Field>
        )}
      />
      {destination === PkiSync.WindowsServer && (
        <>
          <Controller
            name="destinationConfig.sslEnabled"
            control={control}
            render={({ field: { value, onChange } }) => (
              <Field orientation="horizontal" className="mb-4">
                <FieldContent>
                  <FieldTitle>Enable SSL</FieldTitle>
                  <FieldDescription>
                    Connect over HTTPS. When disabled, HTTP with NTLM message encryption is used and
                    no server certificate is required.
                  </FieldDescription>
                </FieldContent>
                <Switch
                  id="target-ssl-enabled"
                  checked={Boolean(value)}
                  onCheckedChange={onChange}
                  disabled={!canSetTargetHost}
                />
              </Field>
            )}
          />
          {sslEnabled && (
            <Controller
              name="destinationConfig.sslCertificate"
              control={control}
              render={({ field: { value, onChange }, fieldState: { error } }) => (
                <Field className="mb-4">
                  <FieldLabel>SSL Certificate</FieldLabel>
                  <TextArea
                    value={(value as string) ?? ""}
                    onChange={(event) => onChange(event.target.value || undefined)}
                    placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
                    disabled={!canSetTargetHost}
                    isError={Boolean(error)}
                    className="min-h-32"
                  />
                  <FieldError errors={[error]} />
                  {!error && (
                    <FieldDescription>
                      Leave empty to verify against the system trust store, or paste the
                      listener&apos;s certificate to verify a self-signed WinRM HTTPS listener.
                    </FieldDescription>
                  )}
                </Field>
              )}
            />
          )}
          {sslEnabled && (
            <Controller
              name="destinationConfig.sslRejectUnauthorized"
              control={control}
              render={({ field: { value, onChange } }) => (
                <Field orientation="horizontal" className="mb-4">
                  <FieldContent>
                    <FieldTitle>Reject Unauthorized</FieldTitle>
                    <FieldDescription>
                      If enabled, Infisical only connects when the listener presents a valid,
                      trusted certificate.
                    </FieldDescription>
                  </FieldContent>
                  <Switch
                    disabled={!canSetTargetHost}
                    id="target-ssl-reject-unauthorized"
                    checked={value !== false}
                    onCheckedChange={onChange}
                  />
                </Field>
              )}
            />
          )}
        </>
      )}
    </>
  );
};
