import { Controller, useFormContext } from "react-hook-form";

import {
  Badge,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  TextArea
} from "@app/components/v3";
import { PkiSync, PkiSyncExportFormat, PostSyncCommandVariable } from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";

const COMMAND_PLACEHOLDERS: Partial<Record<PkiSync, string>> = {
  [PkiSync.LinuxServer]: "cp {{certificatePath}} /etc/nginx/ssl/live.pem && systemctl reload nginx",
  [PkiSync.WindowsServer]: 'Restart-Service -Name "W3SVC"'
};

const VARIABLE_DESCRIPTIONS: Record<PostSyncCommandVariable, string> = {
  [PostSyncCommandVariable.CertificatePath]: "Full path of the certificate file delivered this run",
  [PostSyncCommandVariable.CertificateDirectory]: "The destination directory",
  [PostSyncCommandVariable.CertificateFiles]: "Every path written this run, one per line",
  [PostSyncCommandVariable.CommonName]: "The certificate's common name",
  [PostSyncCommandVariable.Pkcs12Password]: "The PKCS#12 export password"
};

const SINGLE_CERTIFICATE_VARIABLES = [
  PostSyncCommandVariable.CertificatePath,
  PostSyncCommandVariable.CommonName
];

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
    <>
      <p className="mb-4 text-sm text-bunker-300">
        Run a command on the target server after a certificate is delivered, for example restarting
        the service that uses it. Reference this run&apos;s values with the placeholders below.
        Leave it empty to run nothing.
      </p>
      <Controller
        control={control}
        name="syncOptions.postSyncCommand"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field data-invalid={Boolean(error)} data-disabled={!canEditCommand}>
            <FieldLabel htmlFor="post-sync-command">Command</FieldLabel>
            <TextArea
              id="post-sync-command"
              className="min-h-24 font-mono text-xs"
              value={value ?? ""}
              onChange={onChange}
              isError={Boolean(error)}
              readOnly={!canEditCommand}
              disabled={!canEditCommand}
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
      <div className="flex flex-col gap-2">
        <p className="text-xs text-mineshaft-300">Available placeholders</p>
        <ul className="flex flex-col gap-1.5">
          {variables.map((variable) => (
            <li key={variable} className="flex items-center gap-2">
              <Badge variant="neutral" className="font-mono">
                {`{{${variable}}}`}
              </Badge>
              <span className="text-xs text-mineshaft-400">
                {VARIABLE_DESCRIPTIONS[variable]}
                {SINGLE_CERTIFICATE_VARIABLES.includes(variable) &&
                  ". Single-certificate syncs only"}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-mineshaft-400">
          Each placeholder is replaced with its value before the command is sent to the host, and is
          inserted already quoted, so do not wrap one in quotes yourself. Do not paste secrets into
          the command.
        </p>
      </div>
    </>
  );
};
