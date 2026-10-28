import { useId } from "react";
import { Controller, useFormContext } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { AgentVaultMcpTransport } from "@app/hooks/api/agentVault";

import { TRANSPORT_LABELS, TServiceForm } from "./serviceSchema";

const TRANSPORTS = Object.values(AgentVaultMcpTransport);

export const McpDetailsFields = () => {
  const { control } = useFormContext<TServiceForm>();
  const nameInputId = useId();
  const serverUrlInputId = useId();
  const transportLabelId = useId();

  return (
    <div className="flex flex-col gap-5">
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState }) => (
          <Field>
            <FieldLabel htmlFor={nameInputId}>Name</FieldLabel>
            <FieldContent>
              <Input
                {...field}
                id={nameInputId}
                placeholder="linear-mcp"
                isError={Boolean(fieldState.error)}
              />
              <FieldDescription>Use lowercase letters, numbers, and hyphens.</FieldDescription>
              <FieldError>{fieldState.error?.message}</FieldError>
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        control={control}
        name="transport"
        render={({ field }) => (
          <Field>
            <FieldLabel id={transportLabelId}>Transport</FieldLabel>
            <FieldContent>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger aria-labelledby={transportLabelId} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {TRANSPORTS.map((transport) => (
                    <SelectItem key={transport} value={transport}>
                      {TRANSPORT_LABELS[transport]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                Most servers use Streamable HTTP. Pick SSE only for a server on the older HTTP+SSE
                transport.
              </FieldDescription>
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        control={control}
        name="serverUrl"
        render={({ field, fieldState }) => (
          <Field>
            <FieldLabel htmlFor={serverUrlInputId}>Server URL</FieldLabel>
            <FieldContent>
              <Input
                {...field}
                id={serverUrlInputId}
                placeholder="https://mcp.example.com/mcp"
                autoComplete="off"
                spellCheck={false}
                isError={Boolean(fieldState.error)}
              />
              <FieldError>{fieldState.error?.message}</FieldError>
            </FieldContent>
          </Field>
        )}
      />
    </div>
  );
};
