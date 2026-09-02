import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  AgentVaultUnmatchedHost,
  useCreateAgentVaultProxy,
  useUpdateAgentVaultProxy
} from "@app/hooks/api/agentVault";
import { TAgentVaultEnrollment, TAgentVaultProxy } from "@app/hooks/api/agentVault/types";

// Package registries are the traffic an agent makes most and the traffic least worth intercepting,
// so a new proxy starts with them bypassed.
const DEFAULT_BYPASS_HOSTS =
  "registry.npmjs.org, pypi.org, files.pythonhosted.org, proxy.golang.org, crates.io, static.crates.io";

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Required")
    .max(64)
    .regex(/^[a-z0-9-]+$/, "Use lowercase letters, numbers and hyphens only"),
  unmatchedHost: z.nativeEnum(AgentVaultUnmatchedHost),
  bypassHosts: z.string().trim().max(1024).optional(),
  pollInterval: z.coerce.number().int().min(10).max(300)
});

type FormData = z.infer<typeof schema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  // Present in edit mode; absent when registering a new proxy.
  proxy?: TAgentVaultProxy;
  onCreated?: (enrollment: TAgentVaultEnrollment) => void;
};

export const ProxyFormDialog = ({ isOpen, onOpenChange, proxy, onCreated }: Props) => {
  const createProxy = useCreateAgentVaultProxy();
  const updateProxy = useUpdateAgentVaultProxy();
  const isUpdate = Boolean(proxy);

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!isOpen) return;

    reset({
      name: proxy?.name ?? "",
      unmatchedHost: proxy?.unmatchedHost ?? AgentVaultUnmatchedHost.Allow,
      bypassHosts: proxy ? (proxy.bypassHosts ?? "") : DEFAULT_BYPASS_HOSTS,
      pollInterval: proxy?.pollInterval ?? 60
    });
  }, [isOpen, proxy, reset]);

  const onSubmit = async (data: FormData) => {
    const payload = {
      name: data.name,
      unmatchedHost: data.unmatchedHost,
      bypassHosts: data.bypassHosts ? data.bypassHosts : null,
      pollInterval: data.pollInterval
    };

    if (proxy) {
      await updateProxy.mutateAsync({ proxyId: proxy.id, ...payload });
      createNotification({ text: `Proxy "${data.name}" updated`, type: "success" });
    } else {
      const result = await createProxy.mutateAsync(payload);
      createNotification({ text: `Proxy "${data.name}" created`, type: "success" });
      onCreated?.(result.enrollment);
    }

    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{isUpdate ? "Edit Proxy" : "Create Proxy"}</DialogTitle>
            <DialogDescription>
              A proxy is one deployed egress node. Settings reach it on its next poll.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <Controller
              control={control}
              name="name"
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel>Name</FieldLabel>
                  <FieldContent>
                    <Input {...field} placeholder="egress-1" />
                    <FieldError>{fieldState.error?.message}</FieldError>
                  </FieldContent>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="unmatchedHost"
              render={({ field }) => (
                <Field>
                  <FieldLabel>Unmatched Hosts</FieldLabel>
                  <FieldContent>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper">
                        <SelectItem value={AgentVaultUnmatchedHost.Allow}>Allow</SelectItem>
                        <SelectItem value={AgentVaultUnmatchedHost.Deny}>Deny</SelectItem>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      Allow lets traffic to hosts no connection covers pass through, with TLS
                      terminated and no credential attached. Deny blocks it.
                    </FieldDescription>
                  </FieldContent>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="bypassHosts"
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel>Bypass Hosts</FieldLabel>
                  <FieldContent>
                    <Input {...field} placeholder="registry.npmjs.org" />
                    <FieldDescription>
                      Tunnelled untouched: no certificate minted, no credential attached. The escape
                      hatch for clients that pin certificates.
                    </FieldDescription>
                    <FieldError>{fieldState.error?.message}</FieldError>
                  </FieldContent>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="pollInterval"
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel>Poll Interval</FieldLabel>
                  <FieldContent>
                    <Input {...field} type="number" min={10} max={300} />
                    <FieldDescription>
                      Seconds between refreshes, 10 to 300. Every change reaches a running agent
                      within one interval.
                    </FieldDescription>
                    <FieldError>{fieldState.error?.message}</FieldError>
                  </FieldContent>
                </Field>
              )}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="av" isPending={isSubmitting}>
              {isUpdate ? "Save" : "Create Proxy"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
