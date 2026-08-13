import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
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
import { isIPv4 } from "@app/helpers/ip";
import {
  EndpointTargetKind,
  TEndpointTarget,
  useCreateEndpointTarget,
  useUpdateEndpointTarget
} from "@app/hooks/api/endpoint";
import { gatewaysQueryKeys } from "@app/hooks/api/gateways/queries";

// Enough to catch a fat-fingered hostname in the browser; the backend stays the source of truth.
const isValidHostname = (value: string) =>
  value.length <= 253 &&
  /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))+$/.test(value);

const KIND_OPTIONS: { value: EndpointTargetKind; label: string; hint: string }[] = [
  {
    value: EndpointTargetKind.Domain,
    label: "Domain",
    hint: "The device resolves this name to a local listener and tunnels it to the gateway. Use this for an internal site or service reached by name."
  },
  {
    value: EndpointTargetKind.Ip,
    label: "IP Address",
    hint: "The device claims this exact private address for itself and tunnels it to the gateway. Use this for a host reached by address, such as a database."
  }
];

const formSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(64, "Name must be 64 characters or fewer"),
    kind: z.nativeEnum(EndpointTargetKind),
    destination: z.string().trim().min(1, "Destination is required"),
    ip: z.string().trim(),
    port: z.coerce.number().int().min(1, "Port must be between 1 and 65535").max(65535, "Port must be between 1 and 65535"),
    gatewayId: z.string().min(1, "Select a gateway")
  })
  .superRefine(({ kind, destination, ip }, ctx) => {
    if (kind === EndpointTargetKind.Ip) {
      if (!isIPv4(destination)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["destination"],
          message: "Enter an IPv4 address, e.g. 10.0.4.12. For a hostname, choose Domain."
        });
        return;
      }
      if (destination.startsWith("127.")) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["destination"],
          message: "This address already belongs to the device itself"
        });
      }
      return;
    }

    if (!isValidHostname(destination)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["destination"],
        message: "Enter a domain, e.g. wiki.acme.internal. For an address, choose IP Address."
      });
    }

    if (ip && !isIPv4(ip)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ip"],
        message: "Enter an IPv4 address, or leave empty to let the gateway resolve the domain"
      });
    }
  });

type FormData = z.infer<typeof formSchema>;

type Props = {
  target?: TEndpointTarget;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

const DEFAULTS: FormData = {
  name: "",
  kind: EndpointTargetKind.Domain,
  destination: "",
  ip: "",
  port: 80,
  gatewayId: "",
};

export const TargetModal = ({ target, isOpen, onOpenChange }: Props) => {
  const createTarget = useCreateEndpointTarget();
  const updateTarget = useUpdateEndpointTarget();
  const { data: gateways, isPending: isGatewaysLoading } = useQuery(gatewaysQueryKeys.list());
  const isEditing = Boolean(target);

  // Only v2 gateways: the certificate a tunnel needs is minted by the v2 gateway service, so a v1
  // gateway in this list would be an option that cannot work.
  const selectableGateways = useMemo(
    () => (gateways ?? []).filter((gateway) => !gateway.isV1),
    [gateways]
  );

  const {
    register,
    watch,
    setValue,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<FormData>({ resolver: zodResolver(formSchema), defaultValues: DEFAULTS });

  useEffect(() => {
    if (!isOpen) return;

    reset(
      target
        ? {
            name: target.name,
            kind: target.kind,
            destination: target.destination,
            ip: target.ip ?? "",
            port: target.port,
            gatewayId: target.gatewayId ?? ""
          }
        : DEFAULTS
    );
  }, [isOpen, target, reset]);

  const selectedKind = watch("kind");
  const selectedGatewayId = watch("gatewayId");
  const isDomain = selectedKind === EndpointTargetKind.Domain;
  const isPending = createTarget.isPending || updateTarget.isPending;

  const onSubmit = ({ name, kind, destination, ip, port, gatewayId }: FormData) => {
    // An IP target is already an address, so the gateway-side override does not apply to it.
    const gatewayAddress = isDomain && ip ? ip : undefined;

    if (isEditing && target) {
      updateTarget.mutate(
        {
          targetId: target.id,
          name,
          kind,
          destination,
          ip: gatewayAddress ?? null,
          port,
          gatewayId
        },
        {
          onSuccess: () => {
            createNotification({ type: "success", text: `Target "${name}" updated` });
            onOpenChange(false);
          }
        }
      );
      return;
    }

    createTarget.mutate(
      { name, kind, destination, ip: gatewayAddress, port, gatewayId },
      {
        onSuccess: () => {
          createNotification({ type: "success", text: `Target "${name}" created` });
          onOpenChange(false);
        }
      }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Resource" : "Add Resource"}</DialogTitle>
          <DialogDescription>
            Publish a private resource devices can reach. Grant access to it from a device. Traffic is tunnelled
            through a gateway; nothing else on the device changes.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="target-name">Name</FieldLabel>
            <FieldContent>
              <Input
                id="target-name"
                placeholder="e.g. internal-wiki"
                isError={!!errors.name}
                {...register("name")}
              />
              <FieldError>{errors.name?.message}</FieldError>
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel>Target Type</FieldLabel>
            <FieldContent>
              <Select
                value={selectedKind}
                onValueChange={(val) =>
                  setValue("kind", val as EndpointTargetKind, { shouldValidate: true })
                }
              >
                <SelectTrigger className="w-full" isError={!!errors.kind}>
                  <SelectValue placeholder="Select a target type" />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4}>
                  {KIND_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                {KIND_OPTIONS.find((option) => option.value === selectedKind)?.hint}
              </FieldDescription>
            </FieldContent>
          </Field>

          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <Field>
              <FieldLabel htmlFor="target-destination">
                {isDomain ? "Domain" : "Private Address"}
              </FieldLabel>
              <FieldContent>
                <Input
                  id="target-destination"
                  placeholder={isDomain ? "wiki.acme.internal" : "10.0.4.12"}
                  isError={!!errors.destination}
                  {...register("destination")}
                />
                <FieldError>{errors.destination?.message}</FieldError>
              </FieldContent>
            </Field>

            <Field>
              <FieldLabel htmlFor="target-port">Port</FieldLabel>
              <FieldContent>
                <Input
                  id="target-port"
                  type="number"
                  min={1}
                  max={65535}
                  isError={!!errors.port}
                  {...register("port")}
                />
                <FieldError>{errors.port?.message}</FieldError>
              </FieldContent>
            </Field>
          </div>

          {isDomain && (
            <Field>
              <FieldLabel htmlFor="target-ip">Gateway-side Address</FieldLabel>
              <FieldContent>
                <Input
                  id="target-ip"
                  placeholder="10.0.4.12 (optional)"
                  isError={!!errors.ip}
                  {...register("ip")}
                />
                <FieldError>{errors.ip?.message}</FieldError>
                <FieldDescription>
                  Where the gateway dials. Leave empty if the gateway&apos;s own DNS already resolves
                  this domain.
                </FieldDescription>
              </FieldContent>
            </Field>
          )}

          <Field>
            <FieldLabel>Gateway</FieldLabel>
            <FieldContent>
              <Select
                value={selectedGatewayId}
                onValueChange={(val) => setValue("gatewayId", val, { shouldValidate: true })}
              >
                <SelectTrigger className="w-full" isError={!!errors.gatewayId}>
                  <SelectValue
                    placeholder={isGatewaysLoading ? "Loading gateways..." : "Select a gateway"}
                  />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4}>
                  {selectableGateways.map((gateway) => (
                    <SelectItem key={gateway.id} value={gateway.id}>
                      {gateway.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError>{errors.gatewayId?.message}</FieldError>
              {!isGatewaysLoading && selectableGateways.length === 0 && (
                <FieldDescription>
                  No gateways are connected. A target needs one to reach a private network.
                </FieldDescription>
              )}
            </FieldContent>
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="endpoint" isPending={isPending}>
              {isEditing ? "Save Changes" : "Add Resource"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
