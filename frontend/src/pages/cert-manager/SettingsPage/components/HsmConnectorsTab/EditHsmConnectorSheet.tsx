import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheckIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FilterableSelect,
  Input,
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  TextArea
} from "@app/components/v3";
import { useListGatewayPools } from "@app/hooks/api/gateway-pools";
import { gatewaysQueryKeys } from "@app/hooks/api/gateways/queries";
import { THsmConnector, useUpdateHsmConnector } from "@app/hooks/api/hsmConnectors";
import { slugSchema } from "@app/lib/schemas";

const editSchema = z.object({
  name: slugSchema({ min: 1, max: 32, field: "Name" }),
  description: z.string().trim().max(256).optional(),
  reachedFrom: z.string().min(1, "Pick a Gateway that can reach your HSM"),
  slotLabel: z.string().min(1, "Slot label is required").max(128),
  keyNamePrefix: z.string().trim().max(64).optional(),
  pin: z.string().max(512).optional()
});
type EditForm = z.infer<typeof editSchema>;

type ReachedFromOption = { value: string; label: string; group: "gateway" | "pool" };

type Props = {
  connector: THsmConnector | null;
  onClose: () => void;
};

export const EditHsmConnectorSheet = ({ connector, onClose }: Props) => {
  const isOpen = Boolean(connector);
  const updateMutation = useUpdateHsmConnector();

  const { data: gateways = [] } = useQuery(gatewaysQueryKeys.list());
  const { data: pools = [] } = useListGatewayPools();

  const reachedFromOptions: ReachedFromOption[] = useMemo(() => {
    const currentValue = (() => {
      if (connector?.gatewayId) return `gateway:${connector.gatewayId}`;
      if (connector?.gatewayPoolId) return `pool:${connector.gatewayPoolId}`;
      return "";
    })();
    const gatewayOptions: ReachedFromOption[] = gateways
      .filter((g) => !g.isV1)
      .filter((g) => g.capabilities?.pkcs11 === true)
      .map((g) => ({ value: `gateway:${g.id}`, label: g.name, group: "gateway" as const }));
    const poolOptions: ReachedFromOption[] = pools.map((p) => ({
      value: `pool:${p.id}`,
      label: p.name,
      group: "pool" as const
    }));
    const options = [...gatewayOptions, ...poolOptions];
    const currentIncluded = options.some((o) => o.value === currentValue);
    if (!currentIncluded && connector && currentValue) {
      let label = "";
      if (connector.gatewayId) {
        const g = gateways.find((x) => x.id === connector.gatewayId);
        label = g?.name ? `${g.name} (offline)` : `${connector.gatewayId} (offline)`;
      } else if (connector.gatewayPoolId) {
        const p = pools.find((x) => x.id === connector.gatewayPoolId);
        label = p?.name ?? connector.gatewayPoolId;
      }
      return [
        {
          value: currentValue,
          label,
          group: connector.gatewayId ? ("gateway" as const) : ("pool" as const)
        },
        ...options
      ];
    }
    return options;
  }, [gateways, pools, connector]);

  const form = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: "",
      description: "",
      reachedFrom: "",
      slotLabel: "",
      keyNamePrefix: "infisical-",
      pin: ""
    }
  });

  const currentReachedFrom = useMemo(() => {
    if (!connector) return "";
    if (connector.gatewayId) return `gateway:${connector.gatewayId}`;
    if (connector.gatewayPoolId) return `pool:${connector.gatewayPoolId}`;
    return "";
  }, [connector]);

  useEffect(() => {
    if (!connector) return;
    form.reset({
      name: connector.name,
      description: connector.description ?? "",
      reachedFrom: currentReachedFrom,
      slotLabel: connector.slotLabel,
      keyNamePrefix: connector.keyNamePrefix ?? "",
      pin: ""
    });
  }, [connector, currentReachedFrom, form]);

  const watchedReachedFrom = form.watch("reachedFrom");
  const routingChanged =
    Boolean(currentReachedFrom) &&
    Boolean(watchedReachedFrom) &&
    watchedReachedFrom !== currentReachedFrom;

  const onSubmit = async (values: EditForm) => {
    if (!connector) return;
    if (routingChanged && !(values.pin && values.pin.length > 0)) {
      form.setError("pin", {
        type: "manual",
        message:
          "Re-enter the PIN to confirm the new Gateway. Reusing the stored PIN against an unverified Gateway would expose it."
      });
      return;
    }
    const [kind, id] = values.reachedFrom.split(":");
    const credentialsPatch: Record<string, string> = {};
    if (values.slotLabel !== connector.slotLabel) credentialsPatch.slotLabel = values.slotLabel;
    if ((values.keyNamePrefix ?? "") !== (connector.keyNamePrefix ?? ""))
      credentialsPatch.keyNamePrefix = values.keyNamePrefix ?? "";
    if (values.pin && values.pin.length > 0) credentialsPatch.pin = values.pin;

    try {
      await updateMutation.mutateAsync({
        connectorId: connector.id,
        name: values.name !== connector.name ? values.name : undefined,
        description:
          (values.description ?? "") !== (connector.description ?? "")
            ? (values.description ?? "")
            : undefined,
        gatewayId: kind === "gateway" ? id : undefined,
        gatewayPoolId: kind === "pool" ? id : undefined,
        credentials: Object.keys(credentialsPatch).length > 0 ? credentialsPatch : undefined
      });
      createNotification({ type: "success", text: `HSM Connector "${values.name}" updated.` });
      onClose();
    } catch (err) {
      createNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to update HSM Connector"
      });
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex h-full max-h-full flex-col gap-y-0 sm:max-w-[1100px]">
        <SheetHeader className="border-b">
          <SheetTitle>
            <div className="flex w-full items-start gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-warning/10 text-warning">
                <ShieldCheckIcon className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-x-2 text-mineshaft-300">
                  Edit HSM Connector
                </div>
                <p className="text-sm leading-4 text-mineshaft-400">
                  Update name, description, Gateway, slot label, key label prefix, or rotate the
                  PIN. Changes to the PIN, slot, or Gateway re-run a Verify before saving.
                </p>
              </div>
            </div>
          </SheetTitle>
        </SheetHeader>

        <form className="flex min-h-0 flex-1 flex-col" onSubmit={form.handleSubmit(onSubmit)}>
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="flex min-w-0 flex-1 flex-col gap-y-2 overflow-y-auto px-8 py-6">
              <FieldGroup className="p-4">
                <Controller
                  name="name"
                  control={form.control}
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel>
                        Connector name <span className="text-danger">*</span>
                      </FieldLabel>
                      <FieldContent>
                        <Input {...field} isError={Boolean(error)} />
                        <FieldDescription>Lowercase letters, numbers, and dashes.</FieldDescription>
                        <FieldError errors={[error]} />
                      </FieldContent>
                    </Field>
                  )}
                />

                <Controller
                  name="description"
                  control={form.control}
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel>Description</FieldLabel>
                      <FieldContent>
                        <TextArea
                          {...field}
                          value={field.value ?? ""}
                          rows={2}
                          isError={Boolean(error)}
                        />
                        <FieldError errors={[error]} />
                      </FieldContent>
                    </Field>
                  )}
                />

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
                          options={reachedFromOptions}
                          value={reachedFromOptions.find((o) => o.value === field.value) ?? null}
                          onChange={(selected) => {
                            const opt = selected as ReachedFromOption | null;
                            field.onChange(opt?.value ?? "");
                          }}
                          getOptionLabel={(opt) => opt.label}
                          getOptionValue={(opt) => opt.value}
                          groupBy={reachedFromOptions.length > 0 ? "group" : undefined}
                          getGroupHeaderLabel={
                            reachedFromOptions.length > 0
                              ? (group: ReachedFromOption["group"]) =>
                                  group === "gateway" ? "Gateways" : "Gateway Pools"
                              : undefined
                          }
                          placeholder="Select a Gateway..."
                          noOptionsMessage={() => "No PKCS#11-enabled Gateways found."}
                          isError={Boolean(error)}
                        />
                        <FieldDescription>
                          The Infisical Gateway (or pool) that will reach the HSM over PKCS#11.
                        </FieldDescription>
                        <FieldError errors={[error]} />
                      </FieldContent>
                    </Field>
                  )}
                />

                <Controller
                  name="slotLabel"
                  control={form.control}
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel>
                        Slot label <span className="text-danger">*</span>
                      </FieldLabel>
                      <FieldContent>
                        <Input {...field} isError={Boolean(error)} />
                        <FieldError errors={[error]} />
                      </FieldContent>
                    </Field>
                  )}
                />

                <Controller
                  name="keyNamePrefix"
                  control={form.control}
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel>Key label prefix</FieldLabel>
                      <FieldContent>
                        <Input {...field} value={field.value ?? ""} isError={Boolean(error)} />
                        <FieldDescription>
                          Prepended to the label of every key Infisical creates on this HSM.
                        </FieldDescription>
                        <FieldError errors={[error]} />
                      </FieldContent>
                    </Field>
                  )}
                />

                <Controller
                  name="pin"
                  control={form.control}
                  render={({ field, fieldState: { error } }) => (
                    <Field>
                      <FieldLabel>
                        PIN {routingChanged && <span className="text-danger">*</span>}
                      </FieldLabel>
                      <FieldContent>
                        <Input
                          {...field}
                          value={field.value ?? ""}
                          type="password"
                          placeholder="••••••••"
                          autoComplete="new-password"
                          isError={Boolean(error)}
                        />
                        <FieldDescription>
                          {routingChanged
                            ? "Required because you are changing the Gateway. Re-enter the PIN so Infisical can verify it against the new route."
                            : "Leave blank to keep the current PIN. Type a new value to rotate it."}
                        </FieldDescription>
                        <FieldError errors={[error]} />
                      </FieldContent>
                    </Field>
                  )}
                />
              </FieldGroup>
            </div>

            <aside className="hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border px-6 py-6 lg:flex">
              <div className="mb-auto">
                <p className="text-[11px] font-medium tracking-wider text-muted uppercase">
                  Editing
                </p>
                <p className="mt-4 text-sm font-semibold text-foreground">What you can change</p>
                <ul className="mt-2 space-y-2 text-sm leading-relaxed text-muted">
                  <li>
                    <span className="font-medium text-foreground">Name and description.</span>{" "}
                    Display only. No effect on the HSM.
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Gateway.</span> Switch to a
                    different Gateway or Gateway Pool if you moved the HSM or added a new one.
                  </li>
                  <li>
                    <span className="font-medium text-foreground">Slot and PIN.</span> Rotate the
                    PIN or point to a different slot on the same HSM.
                  </li>
                </ul>
                <div className="mt-6 rounded-md border border-border bg-mineshaft-800 p-3 text-xs text-muted">
                  If you change the PIN, slot, or Gateway, Infisical re-runs a Verify against the
                  HSM before saving. A bad PIN or unreachable Gateway will surface here.
                </div>
              </div>
            </aside>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-border px-6 py-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="project" isPending={updateMutation.isPending}>
              Save changes
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
};
