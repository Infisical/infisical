import { Controller, useFormContext } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Input
} from "@app/components/v3";
import { useSubscription } from "@app/context";
import { gatewaysQueryKeys } from "@app/hooks/api";
import { gatewayPoolsQueryKeys } from "@app/hooks/api/gateway-pools/queries";
import { slugSchema } from "@app/lib/schemas";

export const gatewayOptionSchema = z.object({
  id: z.string().min(1, "Gateway is required"),
  name: z.string(),
  // Discriminator. Treated as "gateway" when undefined for backward compatibility with existing forms.
  kind: z.enum(["gateway", "pool"]).optional()
});

export const genericResourceFieldsSchema = z.object({
  name: slugSchema({ min: 1, max: 64, field: "Name" }),
  gateway: gatewayOptionSchema.nullable().refine((val) => val !== null, {
    message: "Gateway is required"
  }),
  metadata: z
    .object({
      key: z.string().trim().min(1),
      value: z.string().trim().default("")
    })
    .array()
    .optional()
});

type GatewayOption = { id: string; name: string; kind?: "gateway" | "pool" };

type GenericFormValues = {
  name: string;
  gateway: GatewayOption | null;
};

export const GenericResourceFields = () => {
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
  const combinedOptions: GatewayOption[] = showPools ? [...poolOptions, ...gatewayOptions] : gatewayOptions;

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
              <Input {...field} autoFocus isError={Boolean(error)} placeholder="my-resource" />
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
            ? (combinedOptions.find((o) => o.id === value.id && (o.kind ?? "gateway") === valueKind) ?? value)
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
    </div>
  );
};
