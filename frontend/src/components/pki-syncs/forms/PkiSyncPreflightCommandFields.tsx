import { Controller, useFormContext } from "react-hook-form";

import { Field, FieldDescription, FieldError, FieldLabel } from "@app/components/v3";
import {
  buildHostCommandTooltipDescriptions,
  PREFLIGHT_COMMAND_VARIABLE_DESCRIPTIONS
} from "@app/helpers/pkiSyncs";
import { HostCommandVariable, PkiSync, PkiSyncExportFormat } from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";
import { HostCommandInput } from "./HostCommandInput";
import { HostCommandVariablesTooltip } from "./HostCommandVariablesTooltip";

const COMMAND_PLACEHOLDERS: Partial<Record<PkiSync, string>> = {
  [PkiSync.LinuxServer]: "test -w {{certificateDirectory}} && systemctl is-active nginx",
  [PkiSync.WindowsServer]:
    'if (-not (Test-Path {{certificateDirectory}})) { throw "destination directory is missing" }'
};

const TOOLTIP_DESCRIPTIONS = buildHostCommandTooltipDescriptions(
  PREFLIGHT_COMMAND_VARIABLE_DESCRIPTIONS
);

type Props = {
  destination?: PkiSync;
  canEditCommand?: boolean;
};

export const PkiSyncPreflightCommandFields = ({ destination, canEditCommand = true }: Props) => {
  const { control, watch } = useFormContext<TPkiSyncForm>();
  const currentDestination = destination ?? watch("destination");
  const isPkcs12 = watch("syncOptions.exportFormat") === PkiSyncExportFormat.Pkcs12;

  const variables = Object.values(HostCommandVariable).filter(
    (variable) => variable !== HostCommandVariable.Pkcs12Password || isPkcs12
  );

  return (
    <Controller
      control={control}
      name="syncOptions.preflightCommand"
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <Field data-invalid={Boolean(error)} data-disabled={!canEditCommand}>
          <FieldLabel htmlFor="preflight-command">
            Preflight check
            <HostCommandVariablesTooltip
              variables={variables}
              descriptions={TOOLTIP_DESCRIPTIONS}
              footer={
                <>
                  Type <span className="font-mono">{"{{"}</span> in the command to pick one. The
                  paths describe the files this run is about to write, so a check can look at where
                  a certificate is going before it goes there. Each variable is inserted already
                  quoted, so do not wrap one in quotes yourself.
                </>
              }
            />
          </FieldLabel>
          <HostCommandInput
            id="preflight-command"
            value={value ?? ""}
            onChange={onChange}
            variables={variables}
            descriptions={PREFLIGHT_COMMAND_VARIABLE_DESCRIPTIONS}
            isError={Boolean(error)}
            isDisabled={!canEditCommand}
            placeholder={canEditCommand ? COMMAND_PLACEHOLDERS[currentDestination] : undefined}
          />
          <FieldDescription>
            {canEditCommand
              ? "Runs before any certificate is written. A non-zero exit stops the sync, so nothing is delivered to a host that is not ready. Also runs once a day on its own, so you hear about a host that went bad before the next renewal does. Capped at 10 seconds."
              : "You do not have permission to set a preflight check on this sync. Ask an administrator to change it."}
          </FieldDescription>
          <FieldError>{error?.message}</FieldError>
        </Field>
      )}
    />
  );
};
