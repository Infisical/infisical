import { Controller, useFormContext } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { useSubscription } from "@app/context";
import { gatewaysQueryKeys } from "@app/hooks/api";
import { gatewayPoolsQueryKeys } from "@app/hooks/api/gateway-pools/queries";

export const gatewayOptionSchema = z.object({
  id: z.string().min(1, "Gateway is required"),
  name: z.string(),
  // Discriminator. Treated as "gateway" when undefined for backward compat with existing forms.
  kind: z.enum(["gateway", "pool"]).optional()
});

export const genericDiscoveryFieldsSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  gateway: gatewayOptionSchema.nullable().refine((val) => val !== null, {
    message: "Gateway is required"
  }),
  schedule: z.string().default("manual")
});

type GenericFormValues = {
  name: string;
  gateway: { id: string; name: string; kind?: "gateway" | "pool" } | null;
  schedule: string;
};

type GatewayOption = { id: string; name: string; kind?: "gateway" | "pool" };

// Hydrate a stored row's gatewayId / gatewayPoolId into the form's discriminated picker value.
export const hydrateGatewayValue = (entity: {
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
}): GatewayOption | undefined => {
  if (entity.gatewayPoolId) return { id: entity.gatewayPoolId, name: "", kind: "pool" };
  if (entity.gatewayId) return { id: entity.gatewayId, name: "", kind: "gateway" };
  return undefined;
};

export const GenericDiscoveryFields = () => {
  const { subscription } = useSubscription();
  const showPools = subscription?.gatewayPool;

  const { data: gateways, isPending: isGatewaysLoading } = useQuery(gatewaysQueryKeys.list());
  const { data: pools, isPending: isPoolsLoading } = useQuery({
    ...gatewayPoolsQueryKeys.list(),
    enabled: Boolean(showPools)
  });

  const isLoading = isGatewaysLoading || (showPools && isPoolsLoading);

  const v2Gateways = (gateways ?? []).filter((g) => !g.isV1);
  const gatewayOptions: GatewayOption[] = v2Gateways.map((g) => ({
    id: g.id,
    name: g.name,
    kind: "gateway"
  }));
  const poolOptions: GatewayOption[] = (pools ?? []).map((p) => ({
    id: p.id,
    name: `Pool: ${p.name}`,
    kind: "pool"
  }));
  const combinedOptions: GatewayOption[] = showPools
    ? [...poolOptions, ...gatewayOptions]
    : gatewayOptions;

  const { control } = useFormContext<GenericFormValues>();

  return (
    <div className="flex flex-col gap-3">
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Name</FieldLabel>
            <FieldContent>
              <div className="relative">
                <Input
                  {...field}
                  autoFocus
                  isError={Boolean(error)}
                  placeholder="my-discovery-source"
                />
              </div>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        control={control}
        name="gateway"
        render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => {
          const valueKind = value?.kind ?? "gateway";
          const selectedOption = value
            ? (combinedOptions.find(
                (o) => o.id === value.id && (o.kind ?? "gateway") === valueKind
              ) ?? value)
            : value;

          return (
            <Field>
              <FieldLabel>Gateway</FieldLabel>
              <FieldContent>
                <FilterableSelect
                  value={selectedOption}
                  onChange={onChange}
                  onBlur={onBlur}
                  options={combinedOptions}
                  isError={Boolean(error)}
                  isLoading={Boolean(isLoading)}
                  placeholder="Select a Gateway..."
                  getOptionLabel={(option) => option.name}
                  getOptionValue={(option) => `${option.kind ?? "gateway"}:${option.id}`}
                />
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          );
        }}
      />

      <Controller
        control={control}
        name="schedule"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Schedule</FieldLabel>
            <FieldContent>
              <Select value={value} onValueChange={onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </div>
  );
};
