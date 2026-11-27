import { Field } from "@infisical/cipher/ui/field";
import { Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";
import { Switch } from "@infisical/cipher/ui/switch";

import {
  GCP_CERTIFICATE_MANAGER_GLOBAL_LOCATION,
  GCP_CERTIFICATE_MANAGER_SCOPES,
  GcpCertificateManagerScope
} from "@app/hooks/api/pkiSyncs/types/gcp-certificate-manager-sync";

import { useV4Adapter } from "../../../../data/adapters";
import { PkiSyncConnectionField } from "../connection-field";
import { TextField, useDraftField, useDraftValue, usePkiSyncDraft } from "../fields";
import { fetchErrorOf, ListField } from "./list-field";

export function GcpCertificateManagerFields({ isUpdate }: { isUpdate?: boolean }) {
  const { setValue } = usePkiSyncDraft();
  const adapter = useV4Adapter("pkiSyncs");

  const connectionId = useDraftValue<string>("connection.id");
  const gcpProjectId = useDraftValue<string>("destinationConfig.gcpProjectId");
  const location = useDraftValue<string>("destinationConfig.location");
  const scopeField = useDraftField<GcpCertificateManagerScope | undefined>(
    "destinationConfig.scope"
  );
  const scope = scopeField.value;
  const certificateMapBinding = useDraftValue<{ certificateMap: string } | undefined>(
    "destinationConfig.certificateMapBinding"
  );
  const scopeValue = scope ?? GcpCertificateManagerScope.Default;

  const isGlobal = location === GCP_CERTIFICATE_MANAGER_GLOBAL_LOCATION;
  const immutableFieldHelpText = isUpdate
    ? "A GCP certificate's project, location and scope are immutable, so this cannot be changed after the sync is created."
    : undefined;
  const isDefaultScope =
    (scope ?? GcpCertificateManagerScope.Default) === GcpCertificateManagerScope.Default;
  const canBindCertificateMap = isGlobal && isDefaultScope;

  const projectsEnabled = Boolean(connectionId);
  const projects = adapter.useGcpProjects(connectionId, { enabled: projectsEnabled });
  const loadingProjects = projects.isPending && projectsEnabled;

  const locationsEnabled = Boolean(connectionId && gcpProjectId);
  const locations = adapter.useGcpLocations(
    { connectionId, gcpProjectId },
    { enabled: locationsEnabled }
  );
  const loadingLocations = locations.isPending && locationsEnabled;

  const mapsEnabled = Boolean(connectionId && gcpProjectId && isGlobal);
  const certificateMaps = adapter.useGcpCertificateMaps(
    { connectionId, gcpProjectId },
    { enabled: mapsEnabled }
  );

  const certificateMapBindingHelpText = (() => {
    if (!isGlobal)
      return "Certificate maps exist only for global certificates. Regional Application Load Balancers attach certificates directly to the target HTTPS proxy.";
    if (!isDefaultScope)
      return `A certificate map entry can only reference a Default-scope certificate, so this is unavailable with the ${GCP_CERTIFICATE_MANAGER_SCOPES[scope as GcpCertificateManagerScope].label} scope.`;
    return "Infisical keeps a certificate map entry pointed at this sync's certificate, so renewals need no change in GCP. Leave this off to upload certificates only.";
  })();

  return (
    <Stack gap={16}>
      <PkiSyncConnectionField
        onChange={() => {
          if (isUpdate) return;
          setValue("destinationConfig.gcpProjectId", "");
          setValue("destinationConfig.location", "");
          setValue("destinationConfig.certificateMapBinding", undefined);
        }}
      />
      <ListField
        name="destinationConfig.gcpProjectId"
        label="GCP project"
        help="Only projects with the Certificate Manager API enabled are listed."
        description={immutableFieldHelpText}
        options={(projects.data ?? []).map((project) => ({
          value: project.id,
          label: `${project.name} (${project.id})`
        }))}
        loading={loadingProjects}
        fetchError={fetchErrorOf(
          projects,
          projectsEnabled,
          "Failed to list GCP projects. Check the connection's permissions."
        )}
        disabled={isUpdate || !connectionId || loadingProjects}
        placeholder={connectionId ? "Select a project" : "Select a connection first"}
        emptyText="No projects found."
        onSelect={() => {
          setValue("destinationConfig.location", "");
          setValue("destinationConfig.certificateMapBinding", undefined);
        }}
      />
      <ListField
        name="destinationConfig.location"
        label="Location"
        help="A certificate's location is immutable and cannot be changed after this sync is created. Use Global for global external Application Load Balancers."
        options={(locations.data ?? []).map((gcpLocation) => ({
          value: gcpLocation.locationId,
          label:
            gcpLocation.locationId === GCP_CERTIFICATE_MANAGER_GLOBAL_LOCATION
              ? "Global"
              : gcpLocation.displayName,
          meta: gcpLocation.locationId
        }))}
        loading={loadingLocations}
        fetchError={fetchErrorOf(
          locations,
          Boolean(gcpProjectId),
          "Failed to list Certificate Manager locations."
        )}
        disabled={isUpdate || !gcpProjectId || loadingLocations}
        placeholder={gcpProjectId ? "Select a location" : "Select a project first"}
        emptyText="No locations found."
        onSelect={(nextLocation) => {
          if (nextLocation === GCP_CERTIFICATE_MANAGER_GLOBAL_LOCATION) return;
          setValue("destinationConfig.certificateMapBinding", undefined);
          if (scope === GcpCertificateManagerScope.AllRegions)
            setValue("destinationConfig.scope", GcpCertificateManagerScope.Default);
        }}
      />
      <Field
        label="Scope"
        description={`${GCP_CERTIFICATE_MANAGER_SCOPES[scopeValue].description}${immutableFieldHelpText ? ` ${immutableFieldHelpText}` : ""}`}
        error={scopeField.error}
      >
        <Select
          aria-label="Scope"
          value={scopeValue}
          onValueChange={(nextScope) => {
            scopeField.onChange(nextScope);
            if (nextScope !== GcpCertificateManagerScope.Default)
              setValue("destinationConfig.certificateMapBinding", undefined);
          }}
          options={Object.values(GcpCertificateManagerScope)
            .filter((option) => isGlobal || option !== GcpCertificateManagerScope.AllRegions)
            .map((option) => ({
              value: option,
              label: GCP_CERTIFICATE_MANAGER_SCOPES[option].label
            }))}
          placeholder="Select a scope"
          disabled={isUpdate || !location}
          invalid={Boolean(scopeField.error)}
        />
      </Field>
      <Switch
        label="Attach to a certificate map"
        description={certificateMapBindingHelpText}
        checked={Boolean(certificateMapBinding)}
        disabled={!canBindCertificateMap}
        onCheckedChange={(checked) =>
          setValue(
            "destinationConfig.certificateMapBinding",
            checked ? { certificateMap: "" } : undefined
          )
        }
      />
      {certificateMapBinding && canBindCertificateMap && (
        <>
          <ListField
            name="destinationConfig.certificateMapBinding.certificateMap"
            label="Certificate map"
            help="Infisical creates entries inside this map but never creates or deletes the map itself."
            options={(certificateMaps.data ?? []).map((map) => ({
              value: map.name,
              label: map.name,
              description: map.description
            }))}
            loading={certificateMaps.isPending && mapsEnabled}
            fetchError={fetchErrorOf(certificateMaps, true, "Failed to list certificate maps.")}
            placeholder="Select a certificate map"
            emptyText="No certificate maps found."
          />
          <TextField
            name="destinationConfig.certificateMapBinding.hostname"
            label="Hostname"
            optional
            description="Leave empty to serve this certificate as the map's primary certificate, used when no hostname matches."
            placeholder="app.example.com"
          />
        </>
      )}
    </Stack>
  );
}
