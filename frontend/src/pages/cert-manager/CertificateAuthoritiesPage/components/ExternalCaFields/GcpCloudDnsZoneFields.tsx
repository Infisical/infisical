import { useState } from "react";
import { Control, Controller } from "react-hook-form";
import { SingleValue } from "react-select";

import { Field, FieldError, FieldLabel, FilterableSelect } from "@app/components/v3";
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
  const { data: zones = [], isPending: isZonesPending } = useGcpConnectionListCloudDnsZones(
    { connectionId, gcpProjectId },
    { enabled: Boolean(connectionId) && Boolean(gcpProjectId) }
  );

  return (
    <Field className="mb-4">
      <FieldLabel>
        Zone <span className="text-danger">*</span>
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
        isError={Boolean(error)}
      />
      <FieldError errors={[error]} />
    </Field>
  );
};

export const GcpCloudDnsZoneFields = ({ control, connectionId }: Props) => {
  const [selectedProjectId, setSelectedProjectId] = useState<string>();

  const { data: projects = [], isPending: isProjectsPending } =
    useGcpConnectionListCloudDnsProjects(connectionId, { enabled: Boolean(connectionId) });

  return (
    <Controller
      name="configuration.dnsProviderConfig.hostedZoneId"
      control={control}
      render={({ field: { value, onChange }, fieldState: { error } }) => {
        const gcpProjectId = selectedProjectId ?? getProjectIdFromZone(value);

        return (
          <>
            <Field className="mb-4">
              <FieldLabel>
                GCP Project <span className="text-danger">*</span>
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
                noOptionsMessage={() =>
                  "No projects found. Grant the connection's service account the DNS Administrator role on your project and enable the Cloud DNS API there."
                }
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
              />
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
