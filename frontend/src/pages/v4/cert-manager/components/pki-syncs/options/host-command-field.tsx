import type { ReactNode } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { Field, FieldHelp } from "@infisical/cipher/ui/field";
import { Inline, Stack } from "@infisical/cipher/ui/layout";

import { buildHostCommandTooltipDescriptions } from "@app/helpers/pkiSyncs";
import {
  HostCommandVariable,
  isKeystoreExportFormat,
  type PkiSyncExportFormat
} from "@app/hooks/api/pkiSyncs/enums";

import { type PkiSyncFieldName, useDraftField, useDraftValue } from "../fields";
import { HostCommandInput } from "./host-command-input";

function HostCommandVariablesHelp({
  variables,
  descriptions,
  footer
}: {
  variables: readonly string[];
  descriptions: Record<string, string>;
  footer: ReactNode;
}) {
  return (
    <FieldHelp label="Available variables">
      <Stack gap={8}>
        <span>Available variables</span>
        <Stack gap={6}>
          {variables.map((variable) => (
            <Inline key={variable} gap={8} align="center" wrap={false}>
              <Badge mono size="sm" tone="soft">{`{{${variable}}}`}</Badge>
              <span>{descriptions[variable]}</span>
            </Inline>
          ))}
        </Stack>
        <span>{footer}</span>
      </Stack>
    </FieldHelp>
  );
}

export function HostCommandField({
  name,
  label,
  descriptions,
  tooltipFooter,
  description,
  noPermissionDescription,
  placeholder,
  canEditCommand = true,
  action
}: {
  name: PkiSyncFieldName;
  label: string;
  descriptions: Record<HostCommandVariable, string>;
  tooltipFooter: ReactNode;
  description: string;
  noPermissionDescription: string;
  placeholder?: string;
  canEditCommand?: boolean;
  action?: ReactNode;
}) {
  const field = useDraftField<string | undefined>(name);
  const exportFormat = useDraftValue<PkiSyncExportFormat | undefined>("syncOptions.exportFormat");
  const isKeystore = isKeystoreExportFormat(exportFormat);
  const variables = Object.values(HostCommandVariable).filter(
    (variable) =>
      variable !== HostCommandVariable.Pkcs12Password &&
      (variable !== HostCommandVariable.ExportPassword || isKeystore)
  );

  return (
    <Stack gap={8}>
      <Field
        label={label}
        help={
          <HostCommandVariablesHelp
            variables={variables}
            descriptions={buildHostCommandTooltipDescriptions(descriptions)}
            footer={tooltipFooter}
          />
        }
        description={canEditCommand ? description : noPermissionDescription}
        error={field.error}
      >
        <HostCommandInput
          name={name}
          value={field.value ?? ""}
          onChange={field.onChange}
          variables={variables}
          descriptions={descriptions}
          invalid={Boolean(field.error)}
          disabled={!canEditCommand}
          placeholder={canEditCommand ? placeholder : undefined}
        />
      </Field>
      {action}
    </Stack>
  );
}
