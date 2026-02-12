import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import {
  Button,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  Switch,
  TextArea
} from "@app/components/v2";
import {
  gatewaysQueryKeys,
  PkiDiscoveryType,
  TPkiDiscovery,
  useCreatePkiDiscovery,
  useUpdatePkiDiscovery
} from "@app/hooks/api";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  discovery?: TPkiDiscovery;
};

const MAX_PORTS = 5;
const MAX_IPS = 256;
const MAX_DOMAINS = 5;
const MIN_CIDR_PREFIX = 24;
const DEFAULT_TLS_PORTS = "443,8443,636,993,995";

const countPorts = (portsStr: string): number => {
  if (!portsStr.trim()) return 0;

  const parts = portsStr.split(",").map((p) => p.trim());

  return parts.reduce((count, part) => {
    if (part.includes("-")) {
      const [startStr, endStr] = part.split("-").map((p) => p.trim());
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!Number.isNaN(start) && !Number.isNaN(end)) {
        return count + end - start + 1;
      }
    } else {
      const port = parseInt(part, 10);
      if (!Number.isNaN(port)) return count + 1;
    }
    return count;
  }, 0);
};

const validatePorts = (portsStr: string): { valid: boolean; error?: string } => {
  if (!portsStr.trim()) {
    return { valid: false, error: "Ports are required" };
  }

  const parts = portsStr.split(",").map((p) => p.trim());

  const invalidPart = parts.find((part) => {
    if (part.includes("-")) {
      const [startStr, endStr] = part.split("-").map((p) => p.trim());
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      return Number.isNaN(start) || Number.isNaN(end) || start < 1 || end > 65535 || start > end;
    }
    const port = parseInt(part, 10);
    return Number.isNaN(port) || port < 1 || port > 65535;
  });

  if (invalidPart) {
    if (invalidPart.includes("-")) {
      return { valid: false, error: `Invalid port range: ${invalidPart}` };
    }
    return { valid: false, error: `Invalid port: ${invalidPart}` };
  }

  const portCount = countPorts(portsStr);
  if (portCount > MAX_PORTS) {
    return { valid: false, error: `Maximum ${MAX_PORTS} ports allowed (you have ${portCount})` };
  }

  return { valid: true };
};

const validateTargets = (targetsStr: string): { valid: boolean; error?: string } => {
  const targets = targetsStr
    .split(/[\n,]/)
    .map((t) => t.trim())
    .filter(Boolean);

  if (targets.length === 0) {
    return { valid: false, error: "At least one target is required" };
  }

  const cidrRanges = targets.filter((t) => t.includes("/"));
  const singleIps = targets.filter((t) => !t.includes("/") && /^\d/.test(t));
  const domains = targets.filter((t) => /[a-zA-Z]/.test(t) && !t.includes("/"));

  const wildcardDomains = domains.filter((d) => d.startsWith("*"));
  if (wildcardDomains.length > 0) {
    return {
      valid: false,
      error: "Wildcard domains are not supported. Please enter specific domain names."
    };
  }

  let totalIpCount = singleIps.length;

  const invalidCidr = cidrRanges.find((cidr) => {
    const prefixMatch = cidr.match(/\/(\d+)$/);
    if (prefixMatch) {
      const prefix = parseInt(prefixMatch[1], 10);
      if (prefix < MIN_CIDR_PREFIX) return true;
      totalIpCount += 2 ** (32 - prefix);
    }
    return false;
  });

  if (invalidCidr) {
    return {
      valid: false,
      error: `CIDR range too large. Maximum is /${MIN_CIDR_PREFIX} (256 IPs)`
    };
  }

  if (totalIpCount > MAX_IPS) {
    return {
      valid: false,
      error: `Maximum ${MAX_IPS} total IPs allowed (including expanded CIDR ranges)`
    };
  }

  if (domains.length > MAX_DOMAINS) {
    return { valid: false, error: `Maximum ${MAX_DOMAINS} domains allowed per discovery` };
  }

  return { valid: true };
};

const formSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters")
    .regex(/^[a-z0-9-]+$/, "Name must contain only lowercase letters, numbers, and hyphens"),
  description: z.string().max(500).optional(),
  targets: z
    .string()
    .min(1, "At least one target is required")
    .refine((val) => validateTargets(val).valid, {
      message: "Invalid targets"
    }),
  ports: z
    .string()
    .min(1, "Ports are required")
    .refine((val) => validatePorts(val).valid, {
      message: "Invalid ports"
    }),
  gatewayId: z.string().optional(),
  isAutoScanEnabled: z.boolean(),
  scanIntervalDays: z.number().min(1).max(365).optional()
});

type FormData = z.infer<typeof formSchema>;

const parseTargets = (targetsStr: string): { domains: string[]; ipRanges: string[] } => {
  const targets = targetsStr
    .split(/[\n,]/)
    .map((t) => t.trim())
    .filter(Boolean);

  const domains: string[] = [];
  const ipRanges: string[] = [];

  targets.forEach((target) => {
    if (/[a-zA-Z]/.test(target) && !target.includes("/")) {
      domains.push(target);
    } else {
      ipRanges.push(target);
    }
  });

  return { domains, ipRanges };
};

const formatTargets = (discovery?: TPkiDiscovery): string => {
  if (!discovery) return "";
  const targets: string[] = [];
  if (discovery.targetConfig.domains) {
    targets.push(...discovery.targetConfig.domains);
  }
  if (discovery.targetConfig.ipRanges) {
    targets.push(...discovery.targetConfig.ipRanges);
  }
  return targets.join("\n");
};

const formatPorts = (discovery?: TPkiDiscovery): string => {
  if (!discovery?.targetConfig.ports) return "";
  return discovery.targetConfig.ports;
};

export const DiscoveryJobModal = ({ isOpen, onClose, projectId, discovery }: Props) => {
  const isEditing = Boolean(discovery);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      targets: "",
      ports: DEFAULT_TLS_PORTS,
      gatewayId: "none",
      isAutoScanEnabled: false,
      scanIntervalDays: 7
    }
  });

  const { data: gatewaysData } = useQuery(gatewaysQueryKeys.list());
  const gateways = (gatewaysData || []).filter((g) => !g.isV1);

  const createDiscovery = useCreatePkiDiscovery();
  const updateDiscovery = useUpdatePkiDiscovery();

  const isAutoScanEnabled = watch("isAutoScanEnabled");

  useEffect(() => {
    if (isOpen) {
      if (discovery) {
        reset({
          name: discovery.name,
          description: discovery.description || "",
          targets: formatTargets(discovery),
          ports: formatPorts(discovery),
          gatewayId: discovery.gatewayId || "none",
          isAutoScanEnabled: discovery.isAutoScanEnabled,
          scanIntervalDays: discovery.scanIntervalDays || 7
        });
      } else {
        reset({
          name: "",
          description: "",
          targets: "",
          ports: DEFAULT_TLS_PORTS,
          gatewayId: "none",
          isAutoScanEnabled: false,
          scanIntervalDays: 7
        });
      }
    }
  }, [isOpen, discovery, reset]);

  const onSubmit = async (data: FormData) => {
    const { domains, ipRanges } = parseTargets(data.targets);
    const ports = data.ports?.trim();

    if (domains.length === 0 && ipRanges.length === 0) {
      return;
    }

    if (!ports) {
      return;
    }

    try {
      if (isEditing && discovery) {
        await updateDiscovery.mutateAsync({
          discoveryId: discovery.id,
          name: data.name,
          description: data.description || null,
          targetConfig: {
            domains: domains.length > 0 ? domains : undefined,
            ipRanges: ipRanges.length > 0 ? ipRanges : undefined,
            ports
          },
          gatewayId: data.gatewayId && data.gatewayId !== "none" ? data.gatewayId : null,
          isAutoScanEnabled: data.isAutoScanEnabled,
          scanIntervalDays: data.isAutoScanEnabled ? data.scanIntervalDays : null
        });
      } else {
        await createDiscovery.mutateAsync({
          projectId,
          name: data.name,
          description: data.description,
          discoveryType: PkiDiscoveryType.Network,
          targetConfig: {
            domains: domains.length > 0 ? domains : undefined,
            ipRanges: ipRanges.length > 0 ? ipRanges : undefined,
            ports
          },
          gatewayId: data.gatewayId && data.gatewayId !== "none" ? data.gatewayId : undefined,
          isAutoScanEnabled: data.isAutoScanEnabled,
          scanIntervalDays: data.isAutoScanEnabled ? data.scanIntervalDays : undefined
        });
      }
      onClose();
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <ModalContent
        title={isEditing ? "Edit Discovery Job" : "Create Discovery Job"}
        subTitle={
          isEditing
            ? "Update the configuration for this discovery job"
            : "Configure a new certificate discovery job to scan your infrastructure"
        }
      >
        <form onSubmit={handleSubmit(onSubmit)}>
          <Controller
            name="name"
            control={control}
            render={({ field }) => (
              <FormControl label="Name" isRequired errorText={errors.name?.message}>
                <Input {...field} placeholder="my-discovery-job" />
              </FormControl>
            )}
          />

          <Controller
            name="description"
            control={control}
            render={({ field }) => (
              <FormControl label="Description" errorText={errors.description?.message}>
                <TextArea
                  {...field}
                  placeholder="Optional description for this discovery job"
                  rows={2}
                />
              </FormControl>
            )}
          />

          <Controller
            name="targets"
            control={control}
            render={({ field }) => (
              <FormControl
                label="Targets"
                isRequired
                tooltipText={`Domains or IP addresses to scan for TLS certificates. Up to ${MAX_DOMAINS} domains or ${MAX_IPS} IPs. Supports one CIDR range (max /${MIN_CIDR_PREFIX}). Cannot mix CIDR ranges with individual IPs.`}
                errorText={
                  errors.targets?.message
                    ? validateTargets(field.value).error || errors.targets.message
                    : undefined
                }
              >
                <TextArea
                  {...field}
                  placeholder="example.com, api.example.com, 192.168.1.0/24"
                  rows={3}
                />
              </FormControl>
            )}
          />

          <Controller
            name="ports"
            control={control}
            render={({ field }) => (
              <FormControl
                label="Ports"
                isRequired
                tooltipText={`TCP ports to scan for TLS certificates. Specify up to ${MAX_PORTS} ports as comma-separated values (e.g. 443, 8443) or ranges (e.g. 8000-8010). Common TLS ports: 443 (HTTPS), 8443, 636 (LDAPS), 993 (IMAPS), 995 (POP3S), 465 (SMTPS).`}
                errorText={
                  errors.ports?.message
                    ? validatePorts(field.value).error || errors.ports.message
                    : undefined
                }
              >
                <Input {...field} placeholder={DEFAULT_TLS_PORTS} />
              </FormControl>
            )}
          />

          <Controller
            name="gatewayId"
            control={control}
            render={({ field }) => (
              <FormControl
                label="Gateway"
                tooltipText="Use a gateway to discover certificates on private networks that are not directly accessible from the internet. The gateway acts as a proxy, routing scan traffic through your infrastructure."
              >
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  placeholder="Select a gateway (optional)"
                  className="w-full"
                >
                  <SelectItem value="none" key="none">
                    None (Direct scan)
                  </SelectItem>
                  {gateways.length === 0 ? (
                    <SelectItem value="no-gateways" isDisabled>
                      No gateways available
                    </SelectItem>
                  ) : (
                    gateways.map((gateway) => (
                      <SelectItem value={gateway.id} key={gateway.id}>
                        {gateway.name}
                      </SelectItem>
                    ))
                  )}
                </Select>
              </FormControl>
            )}
          />

          <Controller
            name="isAutoScanEnabled"
            control={control}
            render={({ field }) => (
              <FormControl>
                <Switch
                  id="auto-scan"
                  className="mr-2 ml-0 bg-mineshaft-400/80 shadow-inner data-[state=checked]:bg-green/80"
                  containerClassName="flex-row-reverse w-fit"
                  thumbClassName="bg-mineshaft-800"
                  isChecked={field.value}
                  onCheckedChange={field.onChange}
                >
                  Auto Scan
                </Switch>
              </FormControl>
            )}
          />

          {isAutoScanEnabled && (
            <Controller
              name="scanIntervalDays"
              control={control}
              render={({ field }) => (
                <FormControl label="Scan Interval">
                  <Select
                    value={String(field.value)}
                    onValueChange={(val) => field.onChange(parseInt(val, 10))}
                    className="w-full"
                  >
                    <SelectItem value="1">Daily</SelectItem>
                    <SelectItem value="7">Weekly</SelectItem>
                    <SelectItem value="14">Every 2 weeks</SelectItem>
                    <SelectItem value="30">Monthly</SelectItem>
                  </Select>
                </FormControl>
              )}
            />
          )}

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="plain" colorSchema="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" isLoading={isSubmitting} colorSchema="primary">
              {isEditing ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};
