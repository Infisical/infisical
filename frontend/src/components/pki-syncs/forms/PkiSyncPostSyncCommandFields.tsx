import { Fragment } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { Info } from "lucide-react";

import {
  Badge,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import {
  POST_SYNC_COMMAND_VARIABLE_DESCRIPTIONS,
  SINGLE_CERTIFICATE_POST_SYNC_COMMAND_VARIABLES
} from "@app/helpers/pkiSyncs";
import { PkiSync, PkiSyncExportFormat, PostSyncCommandVariable } from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";
import { PostSyncCommandInput } from "./PostSyncCommandInput";

const COMMAND_PLACEHOLDERS: Partial<Record<PkiSync, string>> = {
  [PkiSync.LinuxServer]: "cp {{certificatePath}} /etc/nginx/ssl/live.pem && systemctl reload nginx",
  [PkiSync.WindowsServer]: 'Restart-Service -Name "W3SVC"'
};

// Anchored to one side with a gap: a tall tooltip left to collision-flip lands under the cursor for
// a frame, and Radix sets pointer-events:auto inline on the content inside a modal, so it steals the
// hover and the tooltip flickers open/closed.
const PostSyncCommandVariablesTooltip = ({
  variables
}: {
  variables: PostSyncCommandVariable[];
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Info />
    </TooltipTrigger>
    <TooltipContent side="right" sideOffset={8} collisionPadding={16} className="max-w-md">
      <p className="mb-2 font-medium">Available variables</p>
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1.5">
        {variables.map((variable) => (
          <Fragment key={variable}>
            <Badge variant="neutral" className="font-mono">
              {`{{${variable}}}`}
            </Badge>
            <span>
              {POST_SYNC_COMMAND_VARIABLE_DESCRIPTIONS[variable]}
              {SINGLE_CERTIFICATE_POST_SYNC_COMMAND_VARIABLES.includes(variable) &&
                ". Single-certificate syncs only"}
            </span>
          </Fragment>
        ))}
      </div>
      <p className="mt-2">
        Type <span className="font-mono">{"{{"}</span> in the command to pick one. Each variable is
        replaced with its value before the command is sent to the host, and is inserted already
        quoted, so do not wrap one in quotes yourself. Do not paste secrets into the command.
      </p>
    </TooltipContent>
  </Tooltip>
);

type Props = {
  destination?: PkiSync;
  canEditCommand?: boolean;
};

export const PkiSyncPostSyncCommandFields = ({ destination, canEditCommand = true }: Props) => {
  const { control, watch } = useFormContext<TPkiSyncForm>();
  const currentDestination = destination ?? watch("destination");
  const isPkcs12 = watch("syncOptions.exportFormat") === PkiSyncExportFormat.Pkcs12;

  const variables = Object.values(PostSyncCommandVariable).filter(
    (variable) => variable !== PostSyncCommandVariable.Pkcs12Password || isPkcs12
  );

  return (
    <Controller
      control={control}
      name="syncOptions.postSyncCommand"
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <Field data-invalid={Boolean(error)} data-disabled={!canEditCommand}>
          <FieldLabel htmlFor="post-sync-command">
            Command
            <PostSyncCommandVariablesTooltip variables={variables} />
          </FieldLabel>
          <PostSyncCommandInput
            id="post-sync-command"
            value={value ?? ""}
            onChange={onChange}
            variables={variables}
            isError={Boolean(error)}
            isDisabled={!canEditCommand}
            placeholder={canEditCommand ? COMMAND_PLACEHOLDERS[currentDestination] : undefined}
          />
          <FieldDescription>
            {canEditCommand
              ? "Runs once per sync run that delivers a file, as the sync's account, so keep that account least-privilege. If it fails, the sync is marked failed. The command is executed by the gateway, so the sync's connection must use one."
              : "You do not have permission to set a post-sync command on this sync. Ask an administrator to change it."}
          </FieldDescription>
          <FieldError>{error?.message}</FieldError>
        </Field>
      )}
    />
  );
};
