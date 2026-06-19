import { Controller, useForm } from "react-hook-form";
import { ServerIcon } from "lucide-react";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect
} from "@app/components/v3";

import { HostForm } from "./schemas";

export type ReachedFromOption = {
  value: string;
  label: string;
  group: "gateway" | "pool";
};

type Props = {
  form: ReturnType<typeof useForm<HostForm>>;
  options: ReachedFromOption[];
  isLoading: boolean;
};

export const HostStep = ({ form, options, isLoading }: Props) => (
  <FieldGroup>
    <Controller
      name="reachedFrom"
      control={form.control}
      render={({ field, fieldState: { error } }) => (
        <Field>
          <FieldLabel>
            Reached from <span className="text-danger">*</span>
          </FieldLabel>
          <FieldContent>
            <FilterableSelect<ReachedFromOption>
              isLoading={isLoading}
              options={options}
              value={options.find((o) => o.value === field.value) ?? null}
              onChange={(selected) => {
                const opt = selected as ReachedFromOption | null;
                field.onChange(opt?.value ?? "");
              }}
              getOptionLabel={(opt) => opt.label}
              getOptionValue={(opt) => opt.value}
              groupBy={options.length > 0 ? "group" : undefined}
              getGroupHeaderLabel={
                options.length > 0
                  ? (group: ReachedFromOption["group"]) =>
                      group === "gateway" ? "Gateways" : "Gateway Pools"
                  : undefined
              }
              placeholder="Select a Gateway..."
              noOptionsMessage={() => "No PKCS#11-enabled Gateways found."}
              isError={Boolean(error)}
            />
            <FieldDescription>
              The Infisical Gateway that will reach the HSM over PKCS#11.
            </FieldDescription>
            <FieldError errors={[error]} />
          </FieldContent>
        </Field>
      )}
    />

    {!isLoading && options.length === 0 && (
      <div className="rounded-md border border-border bg-mineshaft-800 p-4">
        <div className="flex items-start gap-3">
          <ServerIcon className="mt-0.5 size-4 shrink-0 text-mineshaft-400" />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">No PKCS#11-enabled Gateways yet</p>
            <p className="text-muted">
              Start an Infisical Gateway on a machine that can reach your HSM, passing your HSM
              vendor&apos;s PKCS#11 library:
            </p>
            <pre className="mt-2 overflow-x-auto rounded bg-mineshaft-900 p-2 text-xs text-mineshaft-200">
              infisical gateway start my-gateway --pkcs11-module=/path/to/vendor.so
            </pre>
            <p className="text-muted">The Gateway will appear here as soon as it heartbeats.</p>
          </div>
        </div>
      </div>
    )}
  </FieldGroup>
);
