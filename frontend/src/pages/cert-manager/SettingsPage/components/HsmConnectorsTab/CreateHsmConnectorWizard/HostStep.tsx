import { useCallback } from "react";
import { Controller, useForm } from "react-hook-form";
import { Link, useParams } from "@tanstack/react-router";
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

export const HostStep = ({ form, options, isLoading }: Props) => {
  const { orgId } = useParams({ strict: false });

  const noOptionsMessage = useCallback(
    () => (
      <div className="space-y-1 py-2">
        <p>No Gateways connected to an HSM yet.</p>
        <Link
          to="/organizations/$orgId/networking"
          params={{ orgId: orgId ?? "" }}
          className="underline hover:text-foreground"
        >
          Configure one in Networking
        </Link>
      </div>
    ),
    [orgId]
  );

  return (
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
                noOptionsMessage={noOptionsMessage}
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
                is a lightweight agent that performs HSM operations on Infisical&apos;s behalf. It
                runs inside your network and handles the communication with your HSM.
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
              <p className="text-muted">
                A Gateway with PKCS#11 support must be running on a machine that can reach your HSM.
                This is set up by someone with network and infrastructure access.{" "}
                <a
                  href="https://infisical.com/docs/documentation/platform/pki/settings/hsm-connectors"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  Read the HSM Connectors setup guide
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      )}
    </FieldGroup>
  );
};
