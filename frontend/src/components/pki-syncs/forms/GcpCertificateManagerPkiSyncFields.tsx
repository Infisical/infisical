import { Controller, FieldError as TFieldError, useFormContext, useWatch } from "react-hook-form";
import { SingleValue } from "react-select";
import { AxiosError } from "axios";
import { Info, Loader2Icon } from "lucide-react";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  useGcpConnectionListCertificateManagerLocations,
  useGcpConnectionListCertificateManagerProjects,
  useGcpConnectionListCertificateMaps
} from "@app/hooks/api/appConnections/gcp/queries";
import { TGcpCertificateMap } from "@app/hooks/api/appConnections/gcp/types";
import { GcpCertificateManagerScope, PkiSync } from "@app/hooks/api/pkiSyncs";
import {
  GCP_CERTIFICATE_MANAGER_GLOBAL_LOCATION,
  GCP_CERTIFICATE_MANAGER_SCOPES
} from "@app/hooks/api/pkiSyncs/types/gcp-certificate-manager-sync";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";
import { PkiSyncConnectionField } from "./PkiSyncConnectionField";

type TGcpCertificateManagerForm = TPkiSyncForm & { destination: PkiSync.GcpCertificateManager };

const resolveError = (
  fieldError: TFieldError | undefined,
  {
    isEnabled,
    isError,
    error,
    fallback
  }: { isEnabled: boolean; isError: boolean; error: unknown; fallback: string }
): TFieldError | undefined => {
  if (fieldError) return fieldError;
  if (!isEnabled || !isError) return undefined;

  return {
    type: "manual",
    message: (error as AxiosError<{ message?: string }>)?.response?.data?.message ?? fallback
  };
};

const LoadingRow = ({ label }: { label: string }) => (
  <div className="flex items-center gap-2 py-2 text-sm text-muted">
    <Loader2Icon className="size-4 animate-spin" />
    {label}
  </div>
);

export const GcpCertificateManagerPkiSyncFields = () => {
  const { control, setValue } = useFormContext<TGcpCertificateManagerForm>();

  const connectionId = useWatch({ name: "connection.id", control });
  const gcpProjectId = useWatch({ name: "destinationConfig.gcpProjectId", control });
  const location = useWatch({ name: "destinationConfig.location", control });
  const scope = useWatch({ name: "destinationConfig.scope", control });
  const certificateMapBinding = useWatch({
    name: "destinationConfig.certificateMapBinding",
    control
  });

  const isGlobal = location === GCP_CERTIFICATE_MANAGER_GLOBAL_LOCATION;
  const isDefaultScope =
    (scope ?? GcpCertificateManagerScope.Default) === GcpCertificateManagerScope.Default;
  const canBindCertificateMap = isGlobal && isDefaultScope;

  const {
    data: projects,
    isFetching: isLoadingProjects,
    isError: isProjectsError,
    error: projectsError
  } = useGcpConnectionListCertificateManagerProjects(connectionId, {
    enabled: Boolean(connectionId)
  });

  const {
    data: locations,
    isFetching: isLoadingLocations,
    isError: isLocationsError,
    error: locationsError
  } = useGcpConnectionListCertificateManagerLocations(
    { connectionId, gcpProjectId },
    { enabled: Boolean(connectionId && gcpProjectId) }
  );

  const {
    data: certificateMaps,
    isFetching: isLoadingCertificateMaps,
    isError: isCertificateMapsError,
    error: certificateMapsError
  } = useGcpConnectionListCertificateMaps(
    { connectionId, gcpProjectId },
    { enabled: Boolean(connectionId && gcpProjectId && isGlobal) }
  );

  const certificateMapBindingHelpText = (() => {
    if (!isGlobal)
      return "Certificate maps exist only for global certificates. Regional Application Load Balancers attach certificates directly to the target HTTPS proxy.";
    if (!isDefaultScope)
      return `A certificate map entry can only reference a Default-scope certificate, so this is unavailable with the ${GCP_CERTIFICATE_MANAGER_SCOPES[scope as GcpCertificateManagerScope].label} scope.`;
    return "Infisical keeps a certificate map entry pointed at this sync's certificate, so renewals need no change in GCP. Leave this off to upload certificates only.";
  })();

  const resetDestinationConfig = () => {
    setValue("destinationConfig.gcpProjectId", "");
    setValue("destinationConfig.location", "");
    setValue("destinationConfig.certificateMapBinding", undefined);
  };

  return (
    <>
      <PkiSyncConnectionField onChange={resetDestinationConfig} />

      <Controller
        name="destinationConfig.gcpProjectId"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => {
          const combinedError = resolveError(error, {
            isEnabled: Boolean(connectionId),
            isError: isProjectsError,
            error: projectsError,
            fallback: "Failed to list GCP projects. Check the connection's permissions."
          });

          return (
            <Field className="mb-4">
              <FieldLabel>
                GCP Project
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    Only projects with the Certificate Manager API enabled are listed.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              {connectionId && isLoadingProjects ? (
                <LoadingRow label="Loading projects..." />
              ) : (
                <Select
                  value={value ?? ""}
                  onValueChange={(newValue) => {
                    onChange(newValue);
                    setValue("destinationConfig.location", "");
                    setValue("destinationConfig.certificateMapBinding", undefined);
                  }}
                  disabled={!connectionId || isLoadingProjects}
                >
                  <SelectTrigger className="w-full" isError={Boolean(combinedError)}>
                    <SelectValue
                      placeholder={connectionId ? "Select a project" : "Select a connection first"}
                    />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {(projects ?? []).map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name} ({project.id})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <FieldError errors={[combinedError]} />
            </Field>
          );
        }}
      />

      <Controller
        name="destinationConfig.location"
        control={control}
        render={({ field: { value, onChange }, fieldState: { error } }) => {
          const combinedError = resolveError(error, {
            isEnabled: Boolean(gcpProjectId),
            isError: isLocationsError,
            error: locationsError,
            fallback: "Failed to list Certificate Manager locations."
          });

          return (
            <Field className="mb-4">
              <FieldLabel>
                Location
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    A certificate&apos;s location is immutable and cannot be changed after this sync
                    is created. Use Global for global external Application Load Balancers.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              {gcpProjectId && isLoadingLocations ? (
                <LoadingRow label="Loading locations..." />
              ) : (
                <Select
                  value={value ?? ""}
                  onValueChange={(newValue) => {
                    onChange(newValue);
                    if (newValue !== GCP_CERTIFICATE_MANAGER_GLOBAL_LOCATION) {
                      setValue("destinationConfig.certificateMapBinding", undefined);
                      if (scope === GcpCertificateManagerScope.AllRegions) {
                        setValue("destinationConfig.scope", GcpCertificateManagerScope.Default);
                      }
                    }
                  }}
                  disabled={!gcpProjectId || isLoadingLocations}
                >
                  <SelectTrigger className="w-full" isError={Boolean(combinedError)}>
                    <SelectValue
                      placeholder={gcpProjectId ? "Select a location" : "Select a project first"}
                    />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {(locations ?? []).map((gcpLocation) => (
                      <SelectItem key={gcpLocation.locationId} value={gcpLocation.locationId}>
                        {gcpLocation.locationId === GCP_CERTIFICATE_MANAGER_GLOBAL_LOCATION
                          ? "Global"
                          : gcpLocation.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <FieldError errors={[combinedError]} />
            </Field>
          );
        }}
      />

      <Controller
        name="destinationConfig.scope"
        control={control}
        defaultValue={GcpCertificateManagerScope.Default}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>Scope</FieldLabel>
            <Select
              value={value ?? GcpCertificateManagerScope.Default}
              onValueChange={(nextScope) => {
                onChange(nextScope);
                if (nextScope !== GcpCertificateManagerScope.Default) {
                  setValue("destinationConfig.certificateMapBinding", undefined);
                }
              }}
              disabled={!location}
            >
              <SelectTrigger className="w-full" isError={Boolean(error)}>
                <SelectValue placeholder="Select a scope" />
              </SelectTrigger>
              <SelectContent position="popper">
                {Object.values(GcpCertificateManagerScope)
                  .filter((option) => isGlobal || option !== GcpCertificateManagerScope.AllRegions)
                  .map((option) => (
                    <SelectItem key={option} value={option}>
                      {GCP_CERTIFICATE_MANAGER_SCOPES[option].label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <FieldDescription>
              {
                GCP_CERTIFICATE_MANAGER_SCOPES[
                  (value as GcpCertificateManagerScope) ?? GcpCertificateManagerScope.Default
                ].description
              }
            </FieldDescription>
            <FieldError errors={[error]} />
          </Field>
        )}
      />

      <Field className="mb-4">
        <Field orientation="horizontal">
          <FieldContent>
            <Label htmlFor="gcp-attach-certificate-map" className="flex items-center gap-1.5">
              Attach to a certificate map
            </Label>
          </FieldContent>
          <Switch
            id="gcp-attach-certificate-map"
            variant="project"
            checked={Boolean(certificateMapBinding)}
            disabled={!canBindCertificateMap}
            onCheckedChange={(isChecked) =>
              setValue(
                "destinationConfig.certificateMapBinding",
                isChecked ? { certificateMap: "" } : undefined,
                { shouldDirty: true }
              )
            }
          />
        </Field>
        <FieldDescription>{certificateMapBindingHelpText}</FieldDescription>
      </Field>

      {certificateMapBinding && canBindCertificateMap && (
        <>
          <Controller
            name="destinationConfig.certificateMapBinding.certificateMap"
            control={control}
            render={({ field: { value, onChange }, fieldState: { error } }) => {
              const combinedError = resolveError(error, {
                isEnabled: true,
                isError: isCertificateMapsError,
                error: certificateMapsError,
                fallback: "Failed to list certificate maps."
              });

              return (
                <Field className="mb-4">
                  <FieldLabel>Certificate Map</FieldLabel>
                  <FieldContent>
                    <FilterableSelect
                      isClearable
                      isLoading={isLoadingCertificateMaps}
                      value={certificateMaps?.find((map) => map.name === value) ?? null}
                      onChange={(option) =>
                        onChange((option as SingleValue<TGcpCertificateMap>)?.name ?? "")
                      }
                      options={certificateMaps ?? []}
                      getOptionLabel={(option) => option.name}
                      getOptionValue={(option) => option.name}
                      placeholder="Select a certificate map"
                      isError={Boolean(combinedError)}
                    />
                  </FieldContent>
                  <FieldDescription>
                    Infisical creates entries inside this map but never creates or deletes the map
                    itself.
                  </FieldDescription>
                  <FieldError errors={[combinedError]} />
                </Field>
              );
            }}
          />

          <Controller
            name="destinationConfig.certificateMapBinding.hostname"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <Field className="mb-4">
                <FieldLabel>
                  Hostname <span className="text-muted">(optional)</span>
                </FieldLabel>
                <Input {...field} value={field.value ?? ""} placeholder="app.example.com" />
                <FieldDescription>
                  Leave empty to serve this certificate as the map&apos;s primary certificate, used
                  when no hostname matches.
                </FieldDescription>
                <FieldError errors={[error]} />
              </Field>
            )}
          />
        </>
      )}
    </>
  );
};
