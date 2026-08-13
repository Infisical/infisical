import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  GatewayPicker,
  Input,
  RadioGroup,
  RadioGroupItem,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { useCreateAgentGateway } from "@app/hooks/api/agentGateways";
import { AgentGatewayUnmatchedHostPolicy } from "@app/hooks/api/agentGateways/types";
import { slugSchema } from "@app/lib/schemas";

const formSchema = z
  .object({
    name: slugSchema({ field: "name" }),
    description: z.string().trim().max(500).optional(),
    gatewayId: z.string().uuid().nullable(),
    isLocalModeEnabled: z.boolean(),
    unmatchedHostPolicy: z.nativeEnum(AgentGatewayUnmatchedHostPolicy)
  })
  // Without either, nothing could broker through it: connect has nowhere to run the broker and run is refused.
  .superRefine((form, ctx) => {
    if (!form.isLocalModeEnabled && !form.gatewayId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Attach a Gateway, or allow local mode, so this gateway has some way to broker",
        path: ["gatewayId"]
      });
    }
  });

type FormData = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  projectId: string;
};

export const CreateAgentGatewayModal = ({ isOpen, onOpenChange, projectId }: Props) => {
  const { currentOrg } = useOrganization();
  const navigate = useNavigate();
  const { mutateAsync: createAgentGateway, isPending } = useCreateAgentGateway();

  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      gatewayId: null,
      isLocalModeEnabled: true,
      // Allow by default: most of an agent's traffic legitimately needs no credential, and a new gateway that
      // blocked everything would look broken rather than strict.
      unmatchedHostPolicy: AgentGatewayUnmatchedHostPolicy.Allow
    }
  });

  const onSubmit = async (form: FormData) => {
    const agentGateway = await createAgentGateway({
      projectId,
      name: form.name,
      description: form.description || undefined,
      gatewayId: form.gatewayId,
      isLocalModeEnabled: form.isLocalModeEnabled,
      unmatchedHostPolicy: form.unmatchedHostPolicy
    });

    createNotification({ text: "Successfully created agent gateway", type: "success" });
    reset();
    onOpenChange(false);
    await navigate({
      to: "/organizations/$orgId/projects/secret-management/$projectId/agent-gateways/$agentGatewayId",
      params: { orgId: currentOrg?.id || "", projectId, agentGatewayId: agentGateway.id }
    });
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent>
        <form className="flex h-full min-h-0 flex-col" onSubmit={handleSubmit(onSubmit)}>
          <SheetHeader>
            <SheetTitle>Create Agent Gateway</SheetTitle>
            <SheetDescription>
              Create a gateway that brokers agent requests to proxied services.
            </SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-y-4 overflow-y-auto p-4">
            <Controller
              control={control}
              name="name"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>Name</FieldLabel>
                  <Input {...field} placeholder="prod-agents" />
                  {error?.message && <FieldError>{error.message}</FieldError>}
                </Field>
              )}
            />
            <Controller
              control={control}
              name="description"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>Description</FieldLabel>
                  <Input {...field} placeholder="What this gateway is for" />
                  {error?.message && <FieldError>{error.message}</FieldError>}
                </Field>
              )}
            />
            <Controller
              control={control}
              name="gatewayId"
              render={({ field, fieldState: { error } }) => (
                <Field>
                  <FieldLabel>Gateway</FieldLabel>
                  <GatewayPicker
                    value={{ gatewayId: field.value, gatewayPoolId: null }}
                    onChange={(next) => field.onChange(next.gatewayId)}
                    noGatewayLabel="None (local only)"
                  />
                  {/* A gateway is only needed to broker remotely; local mode runs the broker in the
                      caller's own CLI process and needs nothing deployed. */}
                  <FieldDescription>
                    Optional. Required for remote use; local mode needs no gateway.
                  </FieldDescription>
                  {error?.message && <FieldError>{error.message}</FieldError>}
                </Field>
              )}
            />
            <Controller
              control={control}
              name="unmatchedHostPolicy"
              render={({ field }) => (
                <Field>
                  <FieldLabel>Unmatched Hosts</FieldLabel>
                  <RadioGroup value={field.value} onValueChange={field.onChange} className="gap-2">
                    <FieldLabel htmlFor="create-agent-gateway-unmatched-allow" variant="project">
                      <Field orientation="horizontal" className="items-start gap-3">
                        <RadioGroupItem
                          id="create-agent-gateway-unmatched-allow"
                          value={AgentGatewayUnmatchedHostPolicy.Allow}
                          className="mt-0.5"
                        />
                        <div className="flex-1 text-left">
                          <p className="text-sm font-medium text-foreground">Allowed</p>
                          <p className="text-xs text-muted">
                            Requests to hosts no connected service matches are forwarded with no
                            credential applied.
                          </p>
                        </div>
                      </Field>
                    </FieldLabel>
                    <FieldLabel htmlFor="create-agent-gateway-unmatched-block" variant="project">
                      <Field orientation="horizontal" className="items-start gap-3">
                        <RadioGroupItem
                          id="create-agent-gateway-unmatched-block"
                          value={AgentGatewayUnmatchedHostPolicy.Block}
                          className="mt-0.5"
                        />
                        <div className="flex-1 text-left">
                          <p className="text-sm font-medium text-foreground">Blocked</p>
                          <p className="text-xs text-muted">
                            Only the hosts your connected services cover are reachable. Everything
                            else is refused with a 403.
                          </p>
                        </div>
                      </Field>
                    </FieldLabel>
                  </RadioGroup>
                </Field>
              )}
            />
            <Controller
              control={control}
              name="isLocalModeEnabled"
              render={({ field }) => (
                <Field>
                  <FieldLabel>Local Mode</FieldLabel>
                  <RadioGroup
                    value={field.value ? "allowed" : "disabled"}
                    onValueChange={(value) => field.onChange(value === "allowed")}
                    className="gap-2"
                  >
                    <FieldLabel htmlFor="create-agent-gateway-local-disabled" variant="project">
                      <Field orientation="horizontal" className="items-start gap-3">
                        <RadioGroupItem
                          id="create-agent-gateway-local-disabled"
                          value="disabled"
                          className="mt-0.5"
                        />
                        <div className="flex-1 text-left">
                          <p className="text-sm font-medium text-foreground">Disabled</p>
                          <p className="text-xs text-muted">
                            Agents must broker through the selected gateway.
                          </p>
                        </div>
                      </Field>
                    </FieldLabel>
                    <FieldLabel htmlFor="create-agent-gateway-local-allowed" variant="project">
                      <Field orientation="horizontal" className="items-start gap-3">
                        <RadioGroupItem
                          id="create-agent-gateway-local-allowed"
                          value="allowed"
                          className="mt-0.5"
                        />
                        <div className="flex-1 text-left">
                          <p className="text-sm font-medium text-foreground">Allowed</p>
                          <p className="text-xs text-muted">
                            Members can run an agent on their own machine, brokering under their own
                            permissions.
                          </p>
                        </div>
                      </Field>
                    </FieldLabel>
                  </RadioGroup>
                </Field>
              )}
            />
          </div>
          <SheetFooter>
            <SheetClose asChild>
              <Button variant="ghost">Cancel</Button>
            </SheetClose>
            <Button type="submit" variant="project" isPending={isSubmitting || isPending}>
              Create
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
};
