import { ReactNode } from "react";
import { Controller, FieldPath, useFormContext } from "react-hook-form";

import { Field, FieldDescription, FieldError, FieldLabel } from "@app/components/v3";
import { buildHostCommandTooltipDescriptions } from "@app/helpers/pkiSyncs";
import { HostCommandVariable, PkiSyncExportFormat } from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";
import { HostCommandInput } from "./HostCommandInput";
import { HostCommandVariablesTooltip } from "./HostCommandVariablesTooltip";

type Props = {
  name: FieldPath<TPkiSyncForm>;
  id: string;
  label: string;
  descriptions: Record<HostCommandVariable, string>;
  tooltipFooter: ReactNode;
  description: string;
  noPermissionDescription: string;
  placeholder?: string;
  canEditCommand?: boolean;
  action?: ReactNode;
};

export const HostCommandField = ({
  name,
  id,
  label,
  descriptions,
  tooltipFooter,
  description,
  noPermissionDescription,
  placeholder,
  canEditCommand = true,
  action
}: Props) => {
  const { control, watch } = useFormContext<TPkiSyncForm>();
  const isPkcs12 = watch("syncOptions.exportFormat") === PkiSyncExportFormat.Pkcs12;

  const variables = Object.values(HostCommandVariable).filter(
    (variable) => variable !== HostCommandVariable.Pkcs12Password || isPkcs12
  );

  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { value, onChange }, fieldState: { error } }) => (
        <Field data-invalid={Boolean(error)} data-disabled={!canEditCommand}>
          <FieldLabel htmlFor={id}>
            {label}
            <HostCommandVariablesTooltip
              variables={variables}
              descriptions={buildHostCommandTooltipDescriptions(descriptions)}
              footer={tooltipFooter}
            />
          </FieldLabel>
          <HostCommandInput
            id={id}
            value={(value as string) ?? ""}
            onChange={onChange}
            variables={variables}
            descriptions={descriptions}
            isError={Boolean(error)}
            isDisabled={!canEditCommand}
            placeholder={canEditCommand ? placeholder : undefined}
          />
          <FieldDescription>
            {canEditCommand ? description : noPermissionDescription}
          </FieldDescription>
          {action}
          <FieldError>{error?.message}</FieldError>
        </Field>
      )}
    />
  );
};
