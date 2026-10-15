import { useId } from "react";
import { Controller, useFormContext } from "react-hook-form";

import {
  Button,
  ButtonGroup,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input
} from "@app/components/v3";
import { AgentVaultMcpTransport } from "@app/hooks/api/agentVault";

import { TRANSPORT_LABELS, TServiceForm } from "./serviceSchema";

const TRANSPORTS = Object.values(AgentVaultMcpTransport);

export const McpDetailsFields = () => {
  const { control } = useFormContext<TServiceForm>();
  const nameInputId = useId();
  const serverUrlInputId = useId();

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
            <FieldLabel>Transport</FieldLabel>
            <FieldContent>
              <ButtonGroup aria-label="Transport">
                {TRANSPORTS.map((transport) => {
                  const isSelected = field.value === transport;
                  return (
                    <Button
                      key={transport}
                      type="button"
                      size="sm"
                      variant={isSelected ? "av" : "outline"}
                      aria-pressed={isSelected}
                      onClick={() => field.onChange(transport)}
                    >
                      {TRANSPORT_LABELS[transport]}
                    </Button>
                  );
                })}
              </ButtonGroup>
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
              <FieldDescription>
                The URL your agent connects to. The credential is only sent to this host.
              </FieldDescription>
              <FieldError>{fieldState.error?.message}</FieldError>
            </FieldContent>
          </Field>
        )}
      />
    </div>
  );
};
