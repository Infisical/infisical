import { useMemo } from "react";
import { SingleValue } from "react-select";
import { faWarning } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { AppConnectionOption } from "@app/components/app-connections";
import { FilterableSelect, FormControl } from "@app/components/v2";
import { ProjectPermissionSub, useProject, useProjectPermission } from "@app/context";
import { ProjectPermissionAppConnectionActions } from "@app/context/ProjectPermissionContext/types";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { SECRET_ROTATION_CONNECTION_MAP } from "@app/helpers/secretRotationsV2";
import { usePopUp } from "@app/hooks";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections/queries";
import { SecretRotation } from "@app/hooks/api/secretRotationsV2";
import { AddAppConnectionModal } from "@app/pages/organization/AppConnections/AppConnectionsPage/components/AddAppConnectionModal";

export type TRotationConnectionOverrideRotation = {
  id: string;
  name: string;
  type: SecretRotation;
  connection: { id: string; name: string; app: AppConnection };
  secrets: { id: string; key: string }[];
};

type Props = {
  rotations: TRotationConnectionOverrideRotation[];
  projectId: string;
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  destinationEnvironmentLabel: string;
};

type RowProps = {
  rotation: TRotationConnectionOverrideRotation;
  projectId: string;
  selectedConnectionId: string;
  onSelect: (connectionId: string) => void;
};

const RotationConnectionRow = ({
  rotation,
  projectId,
  selectedConnectionId,
  onSelect
}: RowProps) => {
  const { permission } = useProjectPermission();
  const { currentProject } = useProject();
  const { popUp, handlePopUpToggle, handlePopUpOpen } = usePopUp(["addConnection"] as const);

  const app = SECRET_ROTATION_CONNECTION_MAP[rotation.type];
  const appLabel = APP_CONNECTION_MAP[app].name;

  const { data: availableConnections = [], isPending } = useListAvailableAppConnections(
    app,
    projectId
  );

  const canCreateConnection = permission.can(
    ProjectPermissionAppConnectionActions.Create,
    ProjectPermissionSub.AppConnections
  );

  const selectOptions = useMemo(() => {
    const base: { id: string; name: string }[] = availableConnections.map((c) => ({
      id: c.id,
      name: c.name
    }));
    // Ensure the rotation's current connection is always selectable, even if it's not
    // in the available-connections list (e.g. the actor lacks list access to it).
    if (!base.some((c) => c.id === rotation.connection.id)) {
      base.unshift({ id: rotation.connection.id, name: `${rotation.connection.name} (current)` });
    }
    return canCreateConnection ? [{ id: "_create", name: "Create Connection" }, ...base] : base;
  }, [availableConnections, canCreateConnection, rotation.connection]);

  const selectedOption = selectOptions.find((o) => o.id === selectedConnectionId) ?? null;

  return (
    <>
      <div className="flex flex-col gap-2 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-3">
        <div>
          <span className="font-medium">{rotation.name}</span>
          <span className="ml-2 text-xs text-mineshaft-300">({appLabel})</span>
        </div>
        {rotation.secrets.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-xs text-mineshaft-300">
              Secrets being moved ({rotation.secrets.length})
            </p>
            <div className="flex flex-wrap gap-1">
              {rotation.secrets.map((secret) => (
                <span
                  key={secret.id}
                  className="rounded bg-mineshaft-700 px-2 py-0.5 font-mono text-xs text-mineshaft-200"
                >
                  {secret.key}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      <FormControl
        helperText={
          selectedConnectionId === rotation.connection.id
            ? "Keeping the current connection — the rotation will still authenticate against the source environment's target."
            : "The rotation will authenticate against this connection in the destination environment."
        }
      >
        <FilterableSelect
          value={selectedOption}
          isLoading={isPending}
          options={selectOptions}
          placeholder="Select connection..."
          getOptionLabel={(option) => option.name}
          getOptionValue={(option) => option.id}
          components={{ Option: AppConnectionOption }}
          onChange={(newValue) => {
            const next = newValue as SingleValue<{ id: string; name: string }>;
            if (!next) return;
            if (next.id === "_create") {
              handlePopUpOpen("addConnection");
              return;
            }
            onSelect(next.id);
          }}
        />
      </FormControl>
      <AddAppConnectionModal
        isOpen={popUp.addConnection.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("addConnection", isOpen)}
        projectType={currentProject.type}
        projectId={currentProject.id}
        app={app}
        onComplete={(connection) => {
          if (connection) onSelect(connection.id);
        }}
      />
    </>
  );
};

export const RotationConnectionOverridesStep = ({
  rotations,
  projectId,
  value,
  onChange,
  destinationEnvironmentLabel
}: Props) => {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border border-yellow-700/30 bg-yellow-900/20 p-4">
        <div className="flex items-start gap-3">
          <FontAwesomeIcon icon={faWarning} className="mt-0.5 h-5 w-5 shrink-0 text-yellow-500" />
          <div className="text-sm text-yellow-500">
            <p className="font-medium">Cross-environment rotation move</p>
            <p className="mt-1">
              Moving rotations to{" "}
              <span className="font-semibold">{destinationEnvironmentLabel}</span> also moves every
              secret each rotation generated, even if you didn&apos;t select them individually. Each
              rotation keeps authenticating through its existing connection unless you pick a new
              one; confirm the connection for every rotation below.
            </p>
          </div>
        </div>
      </div>
      {rotations.map((rotation) => (
        <RotationConnectionRow
          key={rotation.id}
          rotation={rotation}
          projectId={projectId}
          selectedConnectionId={value[rotation.id] ?? rotation.connection.id}
          onSelect={(connectionId) => onChange({ ...value, [rotation.id]: connectionId })}
        />
      ))}
    </div>
  );
};
