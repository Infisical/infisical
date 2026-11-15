import { useState } from "react";
import { Control, Controller, ControllerRenderProps } from "react-hook-form";
import { AxiosError } from "axios";
import { Info } from "lucide-react";

import {
  Combobox,
  Field,
  FieldError,
  FieldLabel,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  useGcpConnectionListCloudDnsProjects,
  useGcpConnectionListCloudDnsZones
} from "@app/hooks/api/appConnections/gcp/queries";

import { FormData } from "./schema";

type Props = {
  control: Control<FormData>;
  connectionId: string;
};

const getProjectIdFromZone = (zoneResourceName?: string | null) =>
  zoneResourceName?.split("/")[1] ?? "";

const getApiErrorMessage = (apiError: unknown, fallback: string) =>
  (apiError as AxiosError<{ message?: string }>)?.response?.data?.message ?? fallback;

const GcpCloudDnsZoneSelect = ({
  connectionId,
  gcpProjectId,
  value,
  onChange,
  inputRef,
  error
}: {
  connectionId: string;
  gcpProjectId: string;
  value?: string | null;
  onChange: (value: string) => void;
  inputRef: ControllerRenderProps<FormData, "configuration.dnsProviderConfig.hostedZoneId">["ref"];
  error?: { message?: string };
}) => {
  const {
    data: zones = [],
    isPending: isZonesPending,
    isError: isZonesError,
    error: zonesError
  } = useGcpConnectionListCloudDnsZones(
    { connectionId, gcpProjectId },
    { enabled: Boolean(connectionId) && Boolean(gcpProjectId) }
  );

  const displayedError = isZonesError
    ? {
        message: getApiErrorMessage(zonesError, "Failed to list Cloud DNS zones for this project.")
      }
    : error;

  return (
    <Field className="mb-4">
      <FieldLabel>
        Zone <span className="text-danger">*</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info />
          </TooltipTrigger>
          <TooltipContent className="max-w-md">
            The public Cloud DNS zone where Infisical creates the challenge TXT records. It must
            contain the domains you request certificates for.
          </TooltipContent>
        </Tooltip>
      </FieldLabel>
      <Combobox
        isClearable={false}
        includeMissingSelectedOptions={false}
        ref={inputRef}
        isLoading={isZonesPending && Boolean(connectionId) && Boolean(gcpProjectId)}
        isDisabled={!connectionId || !gcpProjectId}
        value={
          zones.find((zone) => zone.id === value) ||
          (value ? { id: value, name: value.split("/").pop() ?? value, dnsName: "" } : null)
        }
        onValueChange={(option) => {
          onChange(option.id);
        }}
        options={zones}
        placeholder="Select a zone..."
        emptyMessage="No public managed zones found in this project."
        getOptionLabel={(option) =>
          option.dnsName ? `${option.dnsName} (${option.name})` : option.name
        }
        getOptionValue={(option) => option.id}
        isError={Boolean(displayedError)}
      />
      <FieldError errors={[displayedError]} />
    </Field>
  );
};

export const GcpCloudDnsZoneFields = ({ control, connectionId }: Props) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string>();

  const {
    data: projects = [],
    isPending: isProjectsPending,
    isError: isProjectsError,
    error: projectsError
  } = useGcpConnectionListCloudDnsProjects(connectionId, { enabled: Boolean(connectionId) });

  const projectsErrorMessage = isProjectsError
    ? getApiErrorMessage(projectsError, "Failed to list GCP projects for this connection.")
    : undefined;

  return (
    <Controller
      name="configuration.dnsProviderConfig.hostedZoneId"
      control={control}
      render={({ field: { value, onChange, ref }, fieldState: { error } }) => {
        const gcpProjectId = getProjectIdFromZone(value) || selectedProjectId || "";

        return (
          <>
            <Field className="mb-4">
              <FieldLabel>
                GCP Project <span className="text-danger">*</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-md">
                    The Google Cloud project that holds your DNS zone. Only projects that the
                    connection&apos;s service account can see and that have the Cloud DNS API
                    enabled are listed.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              <Combobox
                isClearable={false}
                includeMissingSelectedOptions={false}
                isLoading={isProjectsPending && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={
                  projects.find((project) => project.id === gcpProjectId) ||
                  (gcpProjectId ? { id: gcpProjectId, name: gcpProjectId } : null)
                }
                onValueChange={(option) => {
                  setSelectedProjectId(option.id);
                  onChange("");
                }}
                options={projects}
                placeholder="Select a project..."
                emptyMessage={(inputValue) =>
                  inputValue
                    ? "No matching projects"
                    : "No projects found. Grant the connection's service account the DNS Administrator and Service Usage Viewer roles on your project and enable the Cloud DNS API there."
                }
                getOptionLabel={(option) =>
                  option.name === option.id ? option.id : `${option.name} (${option.id})`
                }
                getOptionValue={(option) => option.id}
                isError={Boolean(projectsErrorMessage)}
              />
              {projectsErrorMessage && <FieldError>{projectsErrorMessage}</FieldError>}
            </Field>
            <GcpCloudDnsZoneSelect
              connectionId={connectionId}
              gcpProjectId={gcpProjectId}
              value={value}
              onChange={onChange}
              inputRef={ref}
              error={error}
            />
          </>
        );
      }}
    />
  );
};
