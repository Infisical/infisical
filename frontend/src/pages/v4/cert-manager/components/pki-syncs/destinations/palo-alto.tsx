import { useEffect } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { Field } from "@infisical/cipher/ui/field";
import { Stack } from "@infisical/cipher/ui/layout";
import { Switch } from "@infisical/cipher/ui/switch";
import { SmallText, StatusText } from "@infisical/cipher/ui/text";

import { getPaloAltoNetworksProfileLabel } from "@app/helpers/pkiSyncs";
import type { TPaloAltoNetworksSslTlsServiceProfile } from "@app/hooks/api/appConnections/palo-alto-networks/queries";

import { useV4Adapter } from "../../../../data/adapters";
import { PkiSyncConnectionField } from "../connection-field";
import { useDraftField, useDraftValue, usePkiSyncDraft } from "../fields";
import { fetchErrorOf, withCurrent } from "./list-field";

const profileValueOf = (profile: { name: string; vsys?: string | null }) =>
  `${profile.name}:${profile.vsys ?? ""}`;

export function PaloAltoNetworksFields({
  withSslTlsServiceProfile = false
}: {
  withSslTlsServiceProfile?: boolean;
}) {
  const { setValue, errors } = usePkiSyncDraft();
  const adapter = useV4Adapter("pkiSyncs");

  const connectionId = useDraftValue<string>("connection.id");
  const templateField = useDraftField<string | undefined>("destinationConfig.template");
  const template = templateField.value;
  const profileName = useDraftValue<string | undefined>(
    "destinationConfig.sslTlsServiceProfileName"
  );
  const profileVsys = useDraftValue<string | undefined>(
    "destinationConfig.sslTlsServiceProfileVsys"
  );
  const pushToDevices = useDraftField<boolean | undefined>("destinationConfig.pushToDevices");
  const profileNameError = errors["destinationConfig.sslTlsServiceProfileName"];

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
      setValue("destinationConfig.template", "");
    }
  }, [templatesData, template, setValue]);

  const clearProfile = () => {
    setValue("destinationConfig.sslTlsServiceProfileName", "");
    setValue("destinationConfig.sslTlsServiceProfileVsys", "");
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
    profileNameError ??
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
        <Field
          label="Template"
          help="Panorama delivers certificates to firewalls through templates. The sync stores certificates in this template."
          error={templateField.error}
        >
          <Combobox
            label="Template"
            value={template ?? ""}
            options={withCurrent(
              (templatesData?.templates ?? []).map((name) => ({ value: name, label: name })),
              template
            )}
            onValueChange={(value) => {
              if (!value || value === template) return;
              templateField.onChange(value);
              clearProfile();
            }}
            placeholder="Select a template"
            emptyText="No templates found."
            invalid={Boolean(templateField.error)}
          />
        </Field>
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
              setValue("destinationConfig.sslTlsServiceProfileVsys", profile.vsys ?? "");
              setValue("destinationConfig.sslTlsServiceProfileName", profile.name);
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
        <Switch
          label="Push to devices"
          description="Pushes every template stack that contains this template to its firewalls when a sync changes the template."
          checked={pushToDevices.value ?? true}
          onCheckedChange={pushToDevices.onChange}
        />
      )}
    </Stack>
  );
}
