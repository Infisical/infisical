import { useEffect } from "react";
import { Controller, useFormContext, useFormState, useWatch } from "react-hook-form";
import { Alert } from "@infisical/cipher/ui/alert";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { Stack } from "@infisical/cipher/ui/layout";
import { Switch } from "@infisical/cipher/ui/switch";
import { SmallText, StatusText } from "@infisical/cipher/ui/text";

import type { TPkiSyncForm } from "@app/components/pki-syncs/forms/schemas/pki-sync-schema";
import { getPaloAltoNetworksProfileLabel } from "@app/helpers/pkiSyncs";
import type { TPaloAltoNetworksSslTlsServiceProfile } from "@app/hooks/api/appConnections/palo-alto-networks/queries";
import { PkiSync } from "@app/hooks/api/pkiSyncs/enums";

import { useV4Adapter } from "../../../../data/adapters";
import { PkiSyncConnectionField } from "../connection-field";
import { errorOf } from "../fields";
import { fetchErrorOf, withCurrent } from "./list-field";

type TPaloAltoForm = TPkiSyncForm & { destination: PkiSync.PaloAltoNetworksSslTlsProfile };

const profileValueOf = (profile: { name: string; vsys?: string | null }) =>
  `${profile.name}:${profile.vsys ?? ""}`;

export function PaloAltoNetworksFields({
  withSslTlsServiceProfile = false
}: {
  withSslTlsServiceProfile?: boolean;
}) {
  const { control, setValue, clearErrors, getFieldState } = useFormContext<TPaloAltoForm>();
  const adapter = useV4Adapter("pkiSyncs");

  const connectionId = useWatch({ control, name: "connection.id" });
  const template = useWatch({ control, name: "destinationConfig.template" });
  const profileName = useWatch({ control, name: "destinationConfig.sslTlsServiceProfileName" });
  const profileVsys = useWatch({ control, name: "destinationConfig.sslTlsServiceProfileVsys" });
  const profileNameError = getFieldState(
    "destinationConfig.sslTlsServiceProfileName",
    useFormState({ control, name: "destinationConfig.sslTlsServiceProfileName" })
  ).error;

  const templates = adapter.usePaloAltoTemplates(connectionId);
  const templatesData = templates.data;
  const isDetectingDevice = Boolean(connectionId) && templates.isPending;
  const isPanorama = Boolean(templatesData?.isPanorama);
  const isProfileSelectReady = Boolean(templatesData) && (!isPanorama || Boolean(template));

  const profilesEnabled = withSslTlsServiceProfile && isProfileSelectReady;
  const profiles = adapter.usePaloAltoSslTlsProfiles(connectionId, template, {
    enabled: profilesEnabled
  });

  useEffect(() => {
    if (templatesData && !templatesData.isPanorama && template) {
      setValue("destinationConfig.template", "", { shouldDirty: true });
    }
  }, [templatesData, template, setValue]);

  const clearProfile = () => {
    setValue("destinationConfig.sslTlsServiceProfileName", "", { shouldDirty: true });
    setValue("destinationConfig.sslTlsServiceProfileVsys", "", { shouldDirty: true });
    clearErrors("destinationConfig.sslTlsServiceProfileName");
  };

  let profilePlaceholder = "Select an SSL/TLS service profile";
  if (!connectionId) profilePlaceholder = "Select a connection first";
  else if (isDetectingDevice) profilePlaceholder = "Loading...";
  else if (isPanorama && !template) profilePlaceholder = "Select a template first";

  const deviceError = fetchErrorOf(
    templates,
    Boolean(connectionId),
    "Failed to read the device. Check the connection settings."
  );
  const profileError =
    profileNameError?.message ??
    fetchErrorOf(
      profiles,
      Boolean(connectionId),
      "Failed to fetch SSL/TLS service profiles. Check the connection settings."
    );

  const profileList: TPaloAltoNetworksSslTlsServiceProfile[] = profiles.data ?? [];
  const selectedProfile = profileName ? { name: profileName, vsys: profileVsys || null } : null;
  const profileOptions = withCurrent(
    profileList.map((profile) => ({
      value: profileValueOf(profile),
      label: getPaloAltoNetworksProfileLabel(profile)
    })),
    selectedProfile ? profileValueOf(selectedProfile) : undefined,
    selectedProfile ? getPaloAltoNetworksProfileLabel(selectedProfile) : undefined
  );

  return (
    <Stack gap={16}>
      <PkiSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.template", "");
          clearProfile();
        }}
      />
      {deviceError && <Alert tone="bad">{deviceError}</Alert>}
      {connectionId && isDetectingDevice && (
        <StatusText loading size="sm">
          Detecting device type...
        </StatusText>
      )}
      {connectionId && templatesData && (
        <SmallText muted>
          {templatesData.isPanorama
            ? "Palo Alto Networks Panorama: Certificates are imported into the selected template."
            : "Palo Alto Networks Firewall: Certificates are imported into the shared certificate store."}
        </SmallText>
      )}
      {isPanorama && (
        <Controller
          control={control}
          name="destinationConfig.template"
          render={({ field, fieldState: { error } }) => (
            <Field
              label="Template"
              help="Panorama delivers certificates to firewalls through templates. The sync stores certificates in this template."
              error={errorOf(error)}
            >
              <Combobox
                label="Template"
                value={field.value ?? ""}
                options={withCurrent(
                  (templatesData?.templates ?? []).map((name) => ({ value: name, label: name })),
                  field.value
                )}
                onValueChange={(value) => {
                  if (!value || value === field.value) return;
                  field.onChange(value);
                  clearErrors("destinationConfig.template");
                  clearProfile();
                }}
                placeholder="Select a template"
                emptyText="No templates found."
                invalid={Boolean(error)}
              />
            </Field>
          )}
        />
      )}
      {withSslTlsServiceProfile && (
        <Field
          label="SSL/TLS service profile"
          help="The sync imports the certificate and sets it as this profile's certificate. A profile uses one certificate, and this sync holds one."
          error={profileError}
        >
          <Combobox
            label="SSL/TLS service profile"
            value={selectedProfile ? profileValueOf(selectedProfile) : ""}
            options={profileOptions}
            onValueChange={(value) => {
              const profile = profileList.find((option) => profileValueOf(option) === value);
              if (!profile) return;
              setValue("destinationConfig.sslTlsServiceProfileVsys", profile.vsys ?? "", {
                shouldDirty: true
              });
              setValue("destinationConfig.sslTlsServiceProfileName", profile.name, {
                shouldDirty: true,
                shouldValidate: true
              });
            }}
            disabled={!isProfileSelectReady}
            loading={profiles.isPending && profilesEnabled}
            placeholder={profilePlaceholder}
            emptyText="No SSL/TLS service profiles found."
            invalid={Boolean(profileError)}
          />
        </Field>
      )}
      {isPanorama && (
        <Controller
          control={control}
          name="destinationConfig.pushToDevices"
          render={({ field }) => (
            <Switch
              label="Push to devices"
              description="Pushes every template stack that contains this template to its firewalls when a sync changes the template."
              checked={field.value ?? true}
              onCheckedChange={field.onChange}
            />
          )}
        />
      )}
    </Stack>
  );
}
