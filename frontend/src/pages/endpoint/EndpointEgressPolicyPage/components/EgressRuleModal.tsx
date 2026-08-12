import { useEffect } from "react";
import { useForm } from "react-hook-form";
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
import { isIPv4, isIPv6, isValidCidr } from "@app/helpers/ip";
import {
  EndpointDestinationKind,
  EndpointEgressRuleAction,
  EndpointEgressRuleType,
  TEndpointEgressRule,
  useCreateEndpointEgressRule,
  useUpdateEndpointEgressRule
} from "@app/hooks/api/endpoint";

// Not an RFC 1123 parser, just enough to catch fat-finger destinations client-side; the backend
// remains the source of truth for what a valid domain looks like.
const isValidHostname = (value: string) =>
  value.length <= 253 &&
  /^(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*$/.test(value);

const KIND_OPTIONS: { value: EndpointDestinationKind; label: string }[] = [
  { value: EndpointDestinationKind.Ip, label: "IP Address" },
  { value: EndpointDestinationKind.Cidr, label: "CIDR Block" },
  { value: EndpointDestinationKind.Domain, label: "Domain" }
];

const KIND_PLACEHOLDER: Record<EndpointDestinationKind, string> = {
  [EndpointDestinationKind.Ip]: "203.0.113.4",
  [EndpointDestinationKind.Cidr]: "203.0.113.0/24",
  [EndpointDestinationKind.Domain]: "malicious-domain.com"
};

const DESTINATION_ERROR: Record<EndpointDestinationKind, string> = {
  [EndpointDestinationKind.Ip]: "Enter a valid IPv4 or IPv6 address",
  [EndpointDestinationKind.Cidr]: "Enter a valid CIDR block, e.g. 203.0.113.0/24",
  [EndpointDestinationKind.Domain]: "Enter a valid domain, e.g. malicious-domain.com"
};

const formSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(64, "Name must be 64 characters or fewer"),
    kind: z.nativeEnum(EndpointDestinationKind, { required_error: "Select a destination type" }),
    destination: z.string().trim().min(1, "Destination is required")
  })
  .superRefine(({ kind, destination }, ctx) => {
    let isValid = true;
    if (kind === EndpointDestinationKind.Ip) isValid = isIPv4(destination) || isIPv6(destination);
    if (kind === EndpointDestinationKind.Cidr) isValid = isValidCidr(destination);
    if (kind === EndpointDestinationKind.Domain) isValid = isValidHostname(destination);

    if (!isValid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["destination"],
        message: DESTINATION_ERROR[kind]
      });
    }
  });

type FormData = z.infer<typeof formSchema>;

type Props = {
  rule?: TEndpointEgressRule;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export const EgressRuleModal = ({ rule, isOpen, onOpenChange }: Props) => {
  const createRule = useCreateEndpointEgressRule();
  const updateRule = useUpdateEndpointEgressRule();
  const isEditing = Boolean(rule);

  const {
    register,
    watch,
    setValue,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", kind: EndpointDestinationKind.Ip, destination: "" }
  });

  useEffect(() => {
    if (isOpen) {
      reset(
        rule
          ? { name: rule.name, kind: rule.kind, destination: rule.destination }
          : { name: "", kind: EndpointDestinationKind.Ip, destination: "" }
      );
    }
  }, [isOpen, rule, reset]);

  const selectedKind = watch("kind");
  const isPending = createRule.isPending || updateRule.isPending;

  const onSubmit = (data: FormData) => {
    if (isEditing && rule) {
      updateRule.mutate(
        { ruleId: rule.id, ...data },
        {
          onSuccess: () => {
            createNotification({ type: "success", text: `Rule "${data.name}" updated` });
            onOpenChange(false);
          }
        }
      );
      return;
    }

    createRule.mutate(
      {
        ruleType: EndpointEgressRuleType.Destination,
        action: EndpointEgressRuleAction.Deny,
        ...data
      },
      {
        onSuccess: () => {
          createNotification({ type: "success", text: `Rule "${data.name}" created` });
          onOpenChange(false);
        }
      }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Egress Rule" : "Add Egress Rule"}</DialogTitle>
          <DialogDescription>
            New rules deny the destination. Allow rules are not enforced by agents yet.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
          <Field>
            <FieldLabel htmlFor="rule-name">Name</FieldLabel>
            <FieldContent>
              <Input
                id="rule-name"
                placeholder="e.g. block-known-exfil-domain"
                isError={!!errors.name}
                {...register("name")}
              />
              <FieldError>{errors.name?.message}</FieldError>
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel>Destination Type</FieldLabel>
            <FieldContent>
              <Select
                value={selectedKind}
                onValueChange={(val) =>
                  setValue("kind", val as EndpointDestinationKind, { shouldValidate: true })
                }
              >
                <SelectTrigger className="w-full" isError={!!errors.kind}>
                  <SelectValue placeholder="Select a destination type" />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4}>
                  {KIND_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError>{errors.kind?.message}</FieldError>
            </FieldContent>
          </Field>

          <Field>
            <FieldLabel htmlFor="rule-destination">Destination</FieldLabel>
            <FieldContent>
              <Input
                id="rule-destination"
                placeholder={KIND_PLACEHOLDER[selectedKind]}
                isError={!!errors.destination}
                {...register("destination")}
              />
              <FieldError>{errors.destination?.message}</FieldError>
              <FieldDescription>Deny is the only action agents enforce today.</FieldDescription>
            </FieldContent>
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="endpoint" isPending={isPending}>
              {isEditing ? "Save Changes" : "Add Rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
