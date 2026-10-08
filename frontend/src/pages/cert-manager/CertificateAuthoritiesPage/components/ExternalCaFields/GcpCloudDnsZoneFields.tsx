import { useState } from "react";
import { Control, Controller } from "react-hook-form";
import { SingleValue } from "react-select";
import { AxiosError } from "axios";
import { Info } from "lucide-react";

import {
  Field,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  useGcpConnectionListCloudDnsProjects,
  useGcpConnectionListCloudDnsZones
} from "@app/hooks/api/appConnections/gcp/queries";
import { TGcpCloudDnsZone, TGcpProject } from "@app/hooks/api/appConnections/gcp/types";

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
  error
}: {
  connectionId: string;
  gcpProjectId: string;
  value?: string | null;
  onChange: (value: string) => void;
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
      <FilterableSelect
        isLoading={isZonesPending && Boolean(connectionId) && Boolean(gcpProjectId)}
        isDisabled={!connectionId || !gcpProjectId}
        value={
          zones.find((zone) => zone.id === value) ||
          (value ? { id: value, name: value.split("/").pop() ?? value, dnsName: "" } : null)
        }
        onChange={(option) => {
          onChange((option as SingleValue<TGcpCloudDnsZone>)?.id ?? "");
        }}
        options={zones}
        placeholder="Select a zone..."
        noOptionsMessage={() => "No public managed zones found in this project."}
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
      render={({ field: { value, onChange }, fieldState: { error } }) => {
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
              <FilterableSelect
                isLoading={isProjectsPending && Boolean(connectionId)}
                isDisabled={!connectionId}
                value={
                  projects.find((project) => project.id === gcpProjectId) ||
                  (gcpProjectId ? { id: gcpProjectId, name: gcpProjectId } : null)
                }
                onChange={(option) => {
                  setSelectedProjectId((option as SingleValue<TGcpProject>)?.id ?? "");
                  onChange("");
                }}
                options={projects}
                placeholder="Select a project..."
                noOptionsMessage={({ inputValue }) =>
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
              error={error}
            />
          </>
        );
      }}
    />
  );
};
