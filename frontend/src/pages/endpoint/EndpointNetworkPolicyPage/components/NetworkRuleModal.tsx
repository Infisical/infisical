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
  EndpointNetworkRuleAction,
  EndpointNetworkRuleType,
  TEndpointNetworkRule,
  useCreateEndpointNetworkRule,
  useUpdateEndpointNetworkRule
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

const RULE_TYPE_OPTIONS: { value: EndpointNetworkRuleType; label: string; hint: string }[] = [
  {
    value: EndpointNetworkRuleType.Destination,
    label: "Block destination",
    hint: "Devices can never reach this destination."
  },
  {
    value: EndpointNetworkRuleType.Volume,
    label: "Limit transfer volume",
    hint: "Applies to every destination. Any one a device sends more than the threshold to within the window is blocked, including destinations nobody listed."
  }
];

const BYTE_UNITS = ["B", "KB", "MB", "GB"] as const;
type ByteUnit = (typeof BYTE_UNITS)[number];

const BYTES_PER_UNIT: Record<ByteUnit, number> = {
  B: 1,
  KB: 1024,
  MB: 1024 ** 2,
  GB: 1024 ** 3
};

// Matches MAX_THRESHOLD_BYTES on the backend, so a too-large threshold fails here with a readable
// message rather than as a 400 from the API.
const MAX_THRESHOLD_BYTES = 1024 ** 4;

// The threshold is a rate, so it needs a window. A lifetime total would eventually be crossed by any
// device that stays on long enough, which makes uptime the trigger rather than behaviour.
const WINDOW_OPTIONS = [
  { value: 1, label: "second" },
  { value: 60, label: "minute" },
  { value: 3600, label: "hour" }
] as const;

const DEFAULT_WINDOW_SECONDS = 60;

const windowLabel = (seconds?: number | null) =>
  WINDOW_OPTIONS.find((option) => option.value === seconds)?.label ?? `${seconds ?? 0}s`;

// Shows an existing threshold in the largest unit that divides it evenly, so 104857600 comes back as
// "100 MB" rather than a number nobody can read.
const splitThresholdBytes = (
  bytes?: number | null
): { thresholdValue: number; thresholdUnit: ByteUnit } => {
  if (!bytes || bytes <= 0) return { thresholdValue: 100, thresholdUnit: "MB" };

  const unit =
    [...BYTE_UNITS].reverse().find((candidate) => bytes % BYTES_PER_UNIT[candidate] === 0) ?? "B";
  return { thresholdValue: bytes / BYTES_PER_UNIT[unit], thresholdUnit: unit };
};

// Matches the backend, which rejects a destination that matches everything: it would also block the
// device's own connection to Infisical, leaving nothing able to undo it.
const WILDCARD_DESTINATIONS = ["0.0.0.0/0", "::/0"];

const formSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(64, "Name must be 64 characters or fewer"),
    ruleType: z.nativeEnum(EndpointNetworkRuleType),
    kind: z.nativeEnum(EndpointDestinationKind, { required_error: "Select a destination type" }),
    destination: z.string().trim(),
    thresholdValue: z.coerce.number(),
    thresholdUnit: z.enum(BYTE_UNITS),
    windowSeconds: z.coerce.number()
  })
  .superRefine(({ kind, destination, ruleType, thresholdValue, thresholdUnit }, ctx) => {
    // A volume rule has no destination to validate: it applies to every destination, and which ones
    // it catches is discovered on the device.
    if (ruleType !== EndpointNetworkRuleType.Volume) {
      if (!destination) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["destination"],
          message: "Destination is required"
        });
        return;
      }

      if (WILDCARD_DESTINATIONS.includes(destination)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["destination"],
          message: "This matches every destination, which would also block this device's own connection to Infisical"
        });
        return;
      }

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

      return;
    }

    if (!Number.isFinite(thresholdValue) || thresholdValue <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["thresholdValue"],
        message: "Enter a transfer threshold greater than zero"
      });
      return;
    }

    if (thresholdValue * BYTES_PER_UNIT[thresholdUnit] > MAX_THRESHOLD_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["thresholdValue"],
        message: "Threshold must be 1 TB or less"
      });
    }
  });

type FormData = z.infer<typeof formSchema>;

type Props = {
  rule?: TEndpointNetworkRule;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
};

export const NetworkRuleModal = ({ rule, isOpen, onOpenChange }: Props) => {
  const createRule = useCreateEndpointNetworkRule();
  const updateRule = useUpdateEndpointNetworkRule();
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
    defaultValues: {
      name: "",
      ruleType: EndpointNetworkRuleType.Destination,
      kind: EndpointDestinationKind.Ip,
      destination: "",
      thresholdValue: 100,
      thresholdUnit: "MB",
      windowSeconds: DEFAULT_WINDOW_SECONDS
    }
  });

  useEffect(() => {
    if (!isOpen) return;

    reset(
      rule
        ? {
            name: rule.name,
            ruleType: rule.ruleType,
            kind: rule.kind ?? EndpointDestinationKind.Ip,
            destination: rule.destination ?? "",
            ...splitThresholdBytes(rule.thresholdBytes),
            windowSeconds: rule.windowSeconds ?? DEFAULT_WINDOW_SECONDS
          }
        : {
            name: "",
            ruleType: EndpointNetworkRuleType.Destination,
            kind: EndpointDestinationKind.Ip,
            destination: "",
            thresholdValue: 100,
            thresholdUnit: "MB",
            windowSeconds: DEFAULT_WINDOW_SECONDS
          }
    );
  }, [isOpen, rule, reset]);

  const selectedKind = watch("kind");
  const selectedRuleType = watch("ruleType");
  const selectedUnit = watch("thresholdUnit");
  const selectedWindow = watch("windowSeconds");
  const isVolumeRule = selectedRuleType === EndpointNetworkRuleType.Volume;
  const isPending = createRule.isPending || updateRule.isPending;

  const onSubmit = ({
    ruleType,
    thresholdValue,
    thresholdUnit,
    windowSeconds,
    name,
    kind,
    destination
  }: FormData) => {
    const isVolume = ruleType === EndpointNetworkRuleType.Volume;
    const thresholdBytes = isVolume ? thresholdValue * BYTES_PER_UNIT[thresholdUnit] : undefined;
    const window = isVolume ? windowSeconds : undefined;

    if (isEditing && rule) {
      updateRule.mutate(
        {
          ruleId: rule.id,
          name,
          thresholdBytes,
          windowSeconds: window,
          // The backend rejects a volume rule carrying either of these, and requires them to move
          // together on a destination rule.
          ...(isVolume ? {} : { kind, destination })
        },
        {
          onSuccess: () => {
            createNotification({ type: "success", text: `Rule "${name}" updated` });
            onOpenChange(false);
          }
        }
      );
      return;
    }

    createRule.mutate(
      {
        ruleType,
        name,
        thresholdBytes,
        windowSeconds: window,
        // A volume rule blocks on trip rather than up front, so it carries no action of its own, and
        // no destination: it applies to whichever one a device sends too much to.
        ...(isVolume ? {} : { kind, destination, action: EndpointNetworkRuleAction.Deny })
      },
      {
        onSuccess: () => {
          createNotification({ type: "success", text: `Rule "${name}" created` });
          onOpenChange(false);
        }
      }
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Network Rule" : "Add Network Rule"}</DialogTitle>
          <DialogDescription>
            Block a named destination outright, or block any destination a device sends too much to.
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
            <FieldLabel>Rule Type</FieldLabel>
            <FieldContent>
              <Select
                value={selectedRuleType}
                // The backend has no path to convert a rule between types, so editing keeps the
                // type it was created with rather than offering a change that would fail.
                disabled={isEditing}
                onValueChange={(val) =>
                  setValue("ruleType", val as EndpointNetworkRuleType, { shouldValidate: true })
                }
              >
                <SelectTrigger className="w-full" isError={!!errors.ruleType}>
                  <SelectValue placeholder="Select a rule type" />
                </SelectTrigger>
                <SelectContent position="popper" sideOffset={4}>
                  {RULE_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>
                {RULE_TYPE_OPTIONS.find((option) => option.value === selectedRuleType)?.hint}
              </FieldDescription>
            </FieldContent>
          </Field>

          {!isVolumeRule && (
            <>
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
            </>
          )}

          {isVolumeRule && (
            <Field>
              <FieldLabel htmlFor="rule-threshold">Transfer Threshold</FieldLabel>
              <FieldContent>
                <div className="flex gap-2">
                  <Input
                    id="rule-threshold"
                    type="number"
                    min={1}
                    className="flex-1"
                    isError={!!errors.thresholdValue}
                    {...register("thresholdValue")}
                  />
                  <Select
                    value={selectedUnit}
                    onValueChange={(val) =>
                      setValue("thresholdUnit", val as ByteUnit, { shouldValidate: true })
                    }
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" sideOffset={4}>
                      {BYTE_UNITS.map((unit) => (
                        <SelectItem key={unit} value={unit}>
                          {unit}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="self-center text-sm text-muted">per</span>
                  <Select
                    value={String(selectedWindow)}
                    onValueChange={(val) =>
                      setValue("windowSeconds", Number(val), { shouldValidate: true })
                    }
                  >
                    <SelectTrigger className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" sideOffset={4}>
                      {WINDOW_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={String(option.value)}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <FieldError>{errors.thresholdValue?.message}</FieldError>
                <FieldDescription>
                  Applies to every destination, so it catches ones nobody listed. If a device sends
                  more than this to any single destination within a rolling {windowLabel(selectedWindow)},
                  the agent blocks that destination and cuts the transfer already in progress. Private
                  networks and Infisical itself are exempt.
                </FieldDescription>
              </FieldContent>
            </Field>
          )}

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
