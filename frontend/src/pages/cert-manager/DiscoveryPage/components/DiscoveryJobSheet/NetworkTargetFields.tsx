import { Controller, useFormContext } from "react-hook-form";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  GatewayPicker,
  Input,
  TextArea
} from "@app/components/v3";
import { isInfisicalCloud } from "@app/helpers/platform";

import {
  DEFAULT_TLS_PORTS,
  MAX_DOMAINS,
  MAX_IPS,
  MAX_PORTS,
  MIN_CIDR_PREFIX,
  TNetworkDiscoveryJobForm
} from "./discovery-job-form-schema";

export const NetworkTargetFields = () => {
  const { control, watch, setValue } = useFormContext<TNetworkDiscoveryJobForm>();
  const gatewayId = watch("gatewayId");
  const gatewayPoolId = watch("gatewayPoolId");

  return (
    <>
      <Controller
        control={control}
        name="targets"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>Targets</FieldLabel>
            <TextArea
              value={value ?? ""}
              onChange={onChange}
              placeholder={"example.com\napi.example.com\n192.168.1.0/24"}
              className="resize-none font-mono"
              rows={5}
              isError={Boolean(error)}
            />
            {!error?.message && (
              <FieldDescription>
                Domains, IP addresses or CIDR ranges, one per line. Up to {MAX_DOMAINS} domains or{" "}
                {MAX_IPS} IPs, and CIDR ranges up to /{MIN_CIDR_PREFIX}.
              </FieldDescription>
            )}
            <FieldError errors={[error]} />
          </Field>
        )}
      />
      <Controller
        control={control}
        name="ports"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>Ports</FieldLabel>
            <Input
              value={value ?? ""}
              onChange={onChange}
              placeholder={DEFAULT_TLS_PORTS}
              isError={Boolean(error)}
              autoComplete="off"
            />
            {!error?.message && (
              <FieldDescription>
                Up to {MAX_PORTS} ports, comma separated. Ranges like 8000-8004 are allowed.
              </FieldDescription>
            )}
            <FieldError errors={[error]} />
          </Field>
        )}
      />
      <Field className="mb-4">
        <FieldLabel>
          Gateway <span className="text-muted">(optional)</span>
        </FieldLabel>
        <GatewayPicker
          value={{ gatewayId: gatewayId ?? null, gatewayPoolId: gatewayPoolId ?? null }}
          onChange={(next) => {
            setValue("gatewayId", next.gatewayId, { shouldDirty: true });
            setValue("gatewayPoolId", next.gatewayPoolId, { shouldDirty: true });
          }}
          className="w-full"
        />
        <FieldDescription>
          Use a gateway to reach targets on a private network.
          {!isInfisicalCloud() &&
            " Self-hosted instances can also set ALLOW_INTERNAL_IP_CONNECTIONS=true to scan private networks without one."}
        </FieldDescription>
      </Field>
    </>
  );
};
