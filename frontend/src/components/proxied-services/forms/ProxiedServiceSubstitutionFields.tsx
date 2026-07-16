import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { InfoIcon, PlusIcon, TrashIcon, TriangleAlertIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  FieldError,
  IconButton,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";

import { TProxiedServiceForm } from "./schema";
import { SecretSelect } from "./SecretSelect";
import { SurfaceSelect } from "./SurfaceSelect";
import { genPlaceholder } from "./utils";

type Props = {
  projectId: string;
  environment: string;
  secretPath: string;
  showCredentialError?: boolean;
  onClearCredentialError?: () => void;
};

export const ProxiedServiceSubstitutionFields = ({
  projectId,
  environment,
  secretPath,
  showCredentialError,
  onClearCredentialError
}: Props) => {
  const {
    control,
    register,
    formState: { errors }
  } = useFormContext<TProxiedServiceForm>();

  const substitutionFields = useFieldArray({ control, name: "substitutions" });

  return (
    <div className="flex flex-col gap-3">
      {showCredentialError && (
        <Alert variant="danger">
          <TriangleAlertIcon />
          <AlertTitle>Add at least one credential</AlertTitle>
          <AlertDescription>
            A proxied service needs at least one header rewrite or substitution. Add a substitution
            below, or go back to Header Rewrites.
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col gap-3">
        {substitutionFields.fields.length === 0 && (
          <div className="rounded-md border border-border bg-container/50 p-4 text-center text-sm text-muted">
            No substitutions added. Click below to add.
          </div>
        )}
        {substitutionFields.fields.map((row, i) => (
          <div
            key={row.id}
            className="flex flex-col gap-3 rounded-md border border-border bg-container/50 p-4 text-sm"
          >
            <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
              <span className="shrink-0 text-muted">Set</span>
              <Input
                className="w-44 font-mono"
                placeholder="ENV_VAR_NAME"
                isError={Boolean(errors.substitutions?.[i]?.placeholderKey)}
                {...register(`substitutions.${i}.placeholderKey`)}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <InfoIcon className="size-3.5 shrink-0 text-muted" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Infisical sets this environment variable on the agent for you, holding the
                  placeholder value.
                </TooltipContent>
              </Tooltip>
              <span className="shrink-0 text-muted">to the placeholder</span>
              <Input
                className="min-w-0 flex-1 font-mono"
                placeholder="placeholder_value"
                isError={Boolean(errors.substitutions?.[i]?.placeholderValue)}
                {...register(`substitutions.${i}.placeholderValue`)}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <InfoIcon className="size-3.5 shrink-0 text-muted" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  The value the agent sends instead of the real secret; the proxy swaps it on the
                  wire. Prefilled to look like a real credential so format-checking clients accept
                  it &mdash; edit it if your client expects a different shape.
                </TooltipContent>
              </Tooltip>
              <IconButton
                variant="ghost"
                size="xs"
                type="button"
                aria-label="Remove substitution"
                className="shrink-0 transition-transform hover:text-danger"
                onClick={() => substitutionFields.remove(i)}
              >
                <TrashIcon className="size-4" />
              </IconButton>
            </div>
            <FieldError
              errors={[
                errors.substitutions?.[i]?.placeholderKey,
                errors.substitutions?.[i]?.placeholderValue
              ]}
            />

            <div className="flex items-center gap-2">
              <span className="shrink-0 text-muted">and replace it in</span>
              <div className="flex-1">
                <Controller
                  control={control}
                  name={`substitutions.${i}.surfaces`}
                  render={({ field }) => (
                    <SurfaceSelect value={field.value} onChange={field.onChange} />
                  )}
                />
                <FieldError errors={[errors.substitutions?.[i]?.surfaces]} />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="shrink-0 text-muted">with value of</span>
              <div className="flex-1">
                <Controller
                  control={control}
                  name={`substitutions.${i}.secretKey`}
                  render={({ field }) => (
                    <SecretSelect
                      projectId={projectId}
                      environment={environment}
                      secretPath={secretPath}
                      value={field.value}
                      onChange={field.onChange}
                      isError={Boolean(errors.substitutions?.[i]?.secretKey)}
                    />
                  )}
                />
                <FieldError errors={[errors.substitutions?.[i]?.secretKey]} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div>
        <Button
          variant="ghost"
          size="xs"
          type="button"
          onClick={() => {
            substitutionFields.append({
              placeholderKey: "",
              placeholderValue: genPlaceholder(),
              secretKey: "",
              surfaces: []
            });
            onClearCredentialError?.();
          }}
        >
          <PlusIcon className="mr-1 size-4" />
          Add Substitution
        </Button>
      </div>
    </div>
  );
};
