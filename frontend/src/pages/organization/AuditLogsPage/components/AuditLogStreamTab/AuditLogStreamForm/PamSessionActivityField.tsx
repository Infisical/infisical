import { useController, useFormContext } from "react-hook-form";

import { Field, FieldContent, FieldDescription, FieldTitle, Toggle } from "@app/components/v3";
import { useScopeVariant } from "@app/hooks";
import { TAuditLogStreamFilters } from "@app/hooks/api/auditLogStreams/types";

type FilterFormShape = {
  filters?: TAuditLogStreamFilters | null;
};

// Separate from products so "All products" streams don't receive session activity.
export const PamSessionActivityField = () => {
  const scopeVariant = useScopeVariant();
  const { control } = useFormContext<FilterFormShape>();
  const { field } = useController({ control, name: "filters.pamSessionActivity" });

  return (
    <div className="mt-8 flex flex-col gap-4">
      <Field orientation="horizontal">
        <FieldContent>
          <FieldTitle id="pam-session-activity-title">Include PAM Session Activity</FieldTitle>
          <FieldDescription>
            Also send each command, query and request run in a PAM session (Windows sessions
            aren&apos;t included).
          </FieldDescription>
        </FieldContent>
        <Toggle
          id="pam-session-activity"
          aria-labelledby="pam-session-activity-title"
          variant={scopeVariant}
          checked={Boolean(field.value)}
          onCheckedChange={(checked) => field.onChange(checked ? { includeOutput: false } : null)}
        />
      </Field>
      {field.value && (
        <Field orientation="horizontal" className="border-l border-border pl-4">
          <FieldContent>
            <FieldTitle id="pam-session-output-title">Include Output</FieldTitle>
            <FieldDescription>
              Also send command output, query results and request and response bodies, which can
              contain sensitive data.
            </FieldDescription>
          </FieldContent>
          <Toggle
            id="pam-session-output"
            aria-labelledby="pam-session-output-title"
            variant={scopeVariant}
            checked={field.value.includeOutput}
            onCheckedChange={(includeOutput) => field.onChange({ includeOutput })}
          />
        </Field>
      )}
    </div>
  );
};
