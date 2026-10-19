import { ReactNode, useState } from "react";
import { Control, FieldPath, useController } from "react-hook-form";
import { SingleValue } from "react-select";
import { Info } from "lucide-react";

import { AppConnectionOption } from "@app/components/app-connections";
import {
  Field,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectPermissionSub, useProject, useProjectPermission } from "@app/context";
import { ProjectPermissionAppConnectionActions } from "@app/context/ProjectPermissionContext/types";
import { APP_CONNECTION_MAP } from "@app/helpers/appConnections";
import { TAvailableAppConnection } from "@app/hooks/api/appConnections";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { AddAppConnectionModal } from "@app/pages/organization/AppConnections/AppConnectionsPage/components";

import { FormData } from "./schema";

type AppConnectionValue = { id: string; name: string };

const CREATE_CONNECTION_OPTION_PREFIX = "_create:";

type Props = {
  control: Control<FormData>;
  name: FieldPath<FormData>;
  label: string;
  tooltip: ReactNode;
  options: TAvailableAppConnection[];
  isLoading: boolean;
  required?: boolean;
  menuPlacement?: "top" | "bottom" | "auto";
  onAfterChange?: () => void;
  createApp?: AppConnection;
};

export const AppConnectionSelectField = ({
  control,
  name,
  label,
  tooltip,
  options,
  isLoading,
  required,
  menuPlacement,
  onAfterChange,
  createApp
}: Props) => {
  const { currentProject } = useProject();
  const { permission } = useProjectPermission();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const {
    field: { value, onChange },
    fieldState: { error }
  } = useController({ control, name });

  const canCreateConnection =
    Boolean(createApp) &&
    permission.can(
      ProjectPermissionAppConnectionActions.Create,
      ProjectPermissionSub.AppConnections
    );

  const selectOptions: AppConnectionValue[] = [
    ...(canCreateConnection && createApp
      ? [
          {
            id: `${CREATE_CONNECTION_OPTION_PREFIX}${createApp}`,
            name: `Create ${APP_CONNECTION_MAP[createApp].name} Connection`
          }
        ]
      : []),
    ...options
  ];

  return (
    <>
      <Field className="mb-4">
        <FieldLabel>
          {label} {required && <span className="text-danger">*</span>}
          <Tooltip>
            <TooltipTrigger asChild>
              <Info />
            </TooltipTrigger>
            <TooltipContent className="max-w-sm">{tooltip}</TooltipContent>
          </Tooltip>
        </FieldLabel>
        <FilterableSelect
          {...(menuPlacement ? { menuPlacement } : {})}
          value={(value as AppConnectionValue)?.id ? (value as AppConnectionValue) : null}
          onChange={(newValue) => {
            if (
              (newValue as SingleValue<AppConnectionValue>)?.id?.startsWith(
                CREATE_CONNECTION_OPTION_PREFIX
              )
            ) {
              setIsCreateModalOpen(true);
              return;
            }
            onChange(newValue);
            onAfterChange?.();
          }}
          isLoading={isLoading}
          options={selectOptions}
          placeholder="Select connection..."
          getOptionLabel={(option) => option.name}
          getOptionValue={(option) => option.id}
          components={{ Option: AppConnectionOption }}
          isError={Boolean(error)}
        />
        <FieldError errors={[error]} />
      </Field>
      {createApp && (
        // the modal portals out of the DOM but React still bubbles its submit to the CA form
        <div className="contents" onSubmit={(e) => e.stopPropagation()}>
          <AddAppConnectionModal
            isOpen={isCreateModalOpen}
            onOpenChange={setIsCreateModalOpen}
            projectType={currentProject.type}
            projectId={currentProject.id}
            app={createApp}
            onComplete={(connection) => {
              if (!connection) return;
              onChange({ id: connection.id, name: connection.name });
              onAfterChange?.();
            }}
          />
        </div>
      )}
    </>
  );
};
