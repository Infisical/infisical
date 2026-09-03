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
  FieldTitle,
  Input,
  RadioGroup,
  RadioGroupItem
} from "@app/components/v3";
import {
  AgentVaultUnmatchedHost,
  useCreateAgentVaultProxy,
  useUpdateAgentVaultProxy
} from "@app/hooks/api/agentVault";
import { TAgentVaultEnrollment, TAgentVaultProxy } from "@app/hooks/api/agentVault/types";
import { slugSchema } from "@app/lib/schemas";

const UNMATCHED_HOST_CHOICES = [
  {
    value: AgentVaultUnmatchedHost.Allow,
    title: "Allow",
    description: "The agent reaches them, with no credential attached."
  },
  {
    value: AgentVaultUnmatchedHost.Deny,
    title: "Deny",
    description: "The agent reaches only the hosts in its access bundles."
  }
];

const schema = z.object({
  name: slugSchema({ max: 64, field: "Name" }),
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
      bypassHosts: proxy?.bypassHosts ?? "",
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
                  <FieldLabel>Hosts no connection covers</FieldLabel>
                  <FieldContent>
                    <RadioGroup value={field.value} onValueChange={field.onChange}>
                      {UNMATCHED_HOST_CHOICES.map((choice) => {
                        const id = `unmatched-${choice.value}`;

                        return (
                          <FieldLabel key={choice.value} htmlFor={id} variant="av">
                            <Field orientation="horizontal">
                              <FieldContent>
                                <FieldTitle>{choice.title}</FieldTitle>
                                <FieldDescription>{choice.description}</FieldDescription>
                              </FieldContent>
                              <RadioGroupItem id={id} value={choice.value} />
                            </Field>
                          </FieldLabel>
                        );
                      })}
                    </RadioGroup>
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
                    <Input {...field} placeholder="registry.npmjs.org, proxy.golang.org" />
                    <FieldDescription>
                      Connections to these hosts are passed straight through without being opened,
                      so no credential is attached and the setting above does not apply. Use it for
                      clients that refuse the proxy&apos;s certificate.
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
                      How often the proxy asks for its configuration, in seconds. It is how long a
                      change here takes to reach a running agent.
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
