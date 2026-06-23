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
            Gateway <span className="text-danger">*</span>
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
              placeholder="Select a Gateway or Gateway Pool..."
              noOptionsMessage={() => "No Gateways connected to an HSM yet."}
              isError={Boolean(error)}
            />
            <FieldDescription>
              A{" "}
              <a
                href="https://infisical.com/docs/documentation/platform/gateways/overview"
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Gateway
              </a>{" "}
              is a lightweight agent you run inside your own network. Infisical sends signing
              requests to it, and it talks to the HSM directly. Only Gateways started with your
              HSM&apos;s PKCS#11 driver appear here.
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
          <div className="min-w-0 flex-1 space-y-2 text-sm">
            <p className="font-medium text-foreground">No Gateways are connected to an HSM yet</p>
            <p className="text-muted">Start a Gateway on a machine that can reach your HSM:</p>
            <pre className="overflow-x-auto rounded bg-mineshaft-900 p-2 text-xs text-mineshaft-200">
              infisical gateway start my-gateway --pkcs11-module=/path/to/HSM-vendor.so
            </pre>
          </div>
        </div>
      </div>
    )}
  </FieldGroup>
);
