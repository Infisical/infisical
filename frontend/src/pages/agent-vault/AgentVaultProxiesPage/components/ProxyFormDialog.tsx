import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { InfoIcon } from "lucide-react";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
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
  RadioGroupItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { addHostListIssues } from "@app/helpers/agentVaultHostPattern";
import {
  AgentVaultTrafficPolicy,
  useCreateAgentVaultProxy,
  useUpdateAgentVaultProxy
} from "@app/hooks/api/agentVault";
import { TAgentVaultEnrollment, TAgentVaultProxy } from "@app/hooks/api/agentVault/types";
import { slugSchema } from "@app/lib/schemas";

const TRAFFIC_POLICY_CHOICES = [
  {
    value: AgentVaultTrafficPolicy.AnyHost,
    title: "Any host",
    description: "Allow requests to reach any host."
  },
  {
    value: AgentVaultTrafficPolicy.BundleHosts,
    title: "Access bundle hosts only",
    description: "Only allow requests to reach hosts specified in access bundles."
  }
];

const schema = z
  .object({
    name: slugSchema({ max: 64, field: "Name" }),
    trafficPolicy: z.nativeEnum(AgentVaultTrafficPolicy),
    allowedHosts: z.string().trim().max(1024).optional(),
    // Guarded before coercion: z.coerce turns "" into 0, which would report the range error instead.
    pollInterval: z
      .string()
      .or(z.number())
      .refine((value) => String(value).trim() !== "", "Poll interval is required")
      .pipe(
        z.coerce
          .number({ invalid_type_error: "Poll interval is required" })
          .int("Poll interval must be a whole number of seconds")
          .min(10, "Poll interval must be at least 10 seconds")
          .max(300, "Poll interval must be at most 300 seconds")
      )
  })
  // Only under the bundle-hosts policy, where the field is on screen: an any-host proxy ignores the
  // list, and a stale value in a hidden field would block Save with an error nothing shows.
  .superRefine((data, ctx) => {
    if (data.trafficPolicy !== AgentVaultTrafficPolicy.BundleHosts) return;
    addHostListIssues(data.allowedHosts, ctx, ["allowedHosts"]);
  });

type FormData = z.infer<typeof schema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
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
    watch,
    formState: { isSubmitting }
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const isBundleOnly = watch("trafficPolicy") === AgentVaultTrafficPolicy.BundleHosts;

  const saveDelayNote = (() => {
    if (!proxy?.heartbeat) return null;
    return proxy.isHealthy
      ? "This proxy picks up the change on its next poll."
      : "This proxy is not connected right now. It picks up the change when it reconnects.";
  })();

  useEffect(() => {
    if (!isOpen) return;

    reset({
      name: proxy?.name ?? "",
      trafficPolicy: proxy?.trafficPolicy ?? AgentVaultTrafficPolicy.AnyHost,
      allowedHosts: proxy?.allowedHosts ?? "",
      pollInterval: proxy?.pollInterval ?? 60
    });
  }, [isOpen, proxy, reset]);

  const onSubmit = async (data: FormData) => {
    try {
      const payload = {
        name: data.name,
        trafficPolicy: data.trafficPolicy,
        allowedHosts: data.allowedHosts ? data.allowedHosts : null,
        pollInterval: data.pollInterval
      };

      if (proxy) {
        await updateProxy.mutateAsync({ proxyId: proxy.id, ...payload });
        createNotification({ text: `Proxy "${data.name}" updated`, type: "success" });
      } else {
        const result = await createProxy.mutateAsync(payload);
        createNotification({ text: `Proxy "${data.name}" created`, type: "success" });
        onCreated?.({ token: result.token, expiresAt: result.expiresAt });
      }

      onOpenChange(false);
    } catch {
      // A failed request returns a 4xx that the global request handler surfaces as a toast
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* DialogContent spaces its own children; the form is the only one, so it has to carry the layout. */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-6">
          <DialogHeader>
            <DialogTitle>{isUpdate ? "Edit Settings" : "Create Proxy"}</DialogTitle>
            <DialogDescription>
              Set how this proxy handles your agents&apos; requests.
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
                    <Input {...field} placeholder="egress-1" isError={Boolean(fieldState.error)} />
                    <FieldError>{fieldState.error?.message}</FieldError>
                  </FieldContent>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="trafficPolicy"
              render={({ field }) => (
                <Field>
                  <FieldLabel>Traffic Policy</FieldLabel>
                  <FieldContent>
                    <RadioGroup value={field.value} onValueChange={field.onChange}>
                      {TRAFFIC_POLICY_CHOICES.map((choice) => {
                        const id = `traffic-policy-${choice.value}`;

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
            {isBundleOnly && (
              <Controller
                control={control}
                name="allowedHosts"
                render={({ field, fieldState }) => (
                  <Field>
                    <FieldLabel>Exceptions</FieldLabel>
                    <FieldContent>
                      <Input
                        {...field}
                        placeholder="registry.npmjs.org, proxy.golang.org"
                        isError={Boolean(fieldState.error)}
                      />
                      <FieldError>{fieldState.error?.message}</FieldError>
                    </FieldContent>
                  </Field>
                )}
              />
            )}
            <Controller
              control={control}
              name="pollInterval"
              render={({ field, fieldState }) => (
                <Field>
                  <FieldLabel>
                    Poll Interval
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <InfoIcon />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        How often the proxy asks for its configuration, in seconds. It is how long a
                        change here takes to reach a running agent.
                      </TooltipContent>
                    </Tooltip>
                  </FieldLabel>
                  <FieldContent>
                    <Input {...field} type="number" isError={Boolean(fieldState.error)} />
                    <FieldError>{fieldState.error?.message}</FieldError>
                  </FieldContent>
                </Field>
              )}
            />
            {saveDelayNote && (
              <Alert variant="info">
                <InfoIcon />
                <AlertDescription>{saveDelayNote}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="av" isPending={isSubmitting}>
              {isUpdate ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
