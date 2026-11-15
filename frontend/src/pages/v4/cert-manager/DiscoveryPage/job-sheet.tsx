import { useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Checkbox } from "@infisical/cipher/ui/checkbox";
import { Combobox } from "@infisical/cipher/ui/combobox";
import { DocumentationLink } from "@infisical/cipher/ui/documentation-link";
import { Field, FieldError, FieldSet } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { DataList } from "@infisical/cipher/ui/list";
import { MultiStep, type MultiStepStep } from "@infisical/cipher/ui/multi-step";
import { RadioGroup, RadioGroupCard } from "@infisical/cipher/ui/radio-group";
import { Select } from "@infisical/cipher/ui/select";
import { Switch } from "@infisical/cipher/ui/switch";
import { TagsInput } from "@infisical/cipher/ui/tags-input";
import { Textarea } from "@infisical/cipher/ui/textarea";

import {
  getDiscoveryDocsUrl,
  MAX_FOLDER_DEPTH,
  PKI_DISCOVERY_TYPE_MAP
} from "@app/helpers/pkiDiscovery";
import { isInfisicalCloud } from "@app/helpers/platform";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { GatewayCapability } from "@app/hooks/api/gateways-v2/types";
import {
  PkiDiscoveryType,
  type TPkiDiscovery,
  WindowsCertificateStore,
  WindowsCertificateStoreLabels
} from "@app/hooks/api/pkiDiscovery/types";

import { readableFailure } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { GatewayPicker } from "../../networking/gateway-picker";
import { BadgeList, DiscoveryTypeIcon } from "./discovery-shared";
import {
  CA_CERTIFICATE_STORES,
  createJobDto,
  DEFAULT_TLS_PORTS,
  type JobDraft,
  type JobErrors,
  jobDraft,
  jobErrors,
  MAX_DOMAINS,
  MAX_IPS,
  MAX_PORTS,
  MAX_SEARCH_FOLDERS,
  MAX_SKIP_FOLDERS,
  MIN_CIDR_PREFIX,
  parseTargets,
  SCAN_INTERVAL_OPTIONS,
  updateJobDto,
  validateLinuxFolder
} from "./job-form";

type StepProps = {
  draft: JobDraft;
  errors: JobErrors;
  set: <K extends keyof JobDraft>(key: K, value: JobDraft[K]) => void;
};

const STORE_DESCRIPTIONS: Record<WindowsCertificateStore, string> = {
  [WindowsCertificateStore.Personal]:
    "Server certificates for IIS, Remote Desktop, SQL Server and most other applications.",
  [WindowsCertificateStore.WebHosting]: "Certificates added for IIS sites.",
  [WindowsCertificateStore.RemoteDesktop]: "The certificate Remote Desktop uses on this server.",
  [WindowsCertificateStore.IntermediateCertificationAuthorities]: "Intermediate CA certificates.",
  [WindowsCertificateStore.TrustedRootCertificationAuthorities]:
    "Root CAs this server trusts, including the public ones built into Windows."
};

const SERVER_STORES = [
  WindowsCertificateStore.Personal,
  WindowsCertificateStore.WebHosting,
  WindowsCertificateStore.RemoteDesktop
];

const TargetsStep = ({ draft, errors, set }: StepProps) => (
  <Stack gap={16}>
    <Field
      label="Targets"
      description={`Domains, IP addresses or CIDR ranges, one per line. Up to ${MAX_DOMAINS} domains or ${MAX_IPS} IPs, and CIDR ranges up to /${MIN_CIDR_PREFIX}.`}
      error={errors.targets}
      wide
    >
      <Textarea
        mono
        rows={5}
        value={draft.targets}
        placeholder={"example.com\napi.example.com\n192.168.1.0/24"}
        aria-invalid={Boolean(errors.targets) || undefined}
        onChange={(event) => set("targets", event.target.value)}
      />
    </Field>
    <Field
      label="Ports"
      description={`Up to ${MAX_PORTS} ports, comma separated. Ranges like 8000-8004 are allowed.`}
      error={errors.ports}
      wide
    >
      <Input
        mono
        value={draft.ports}
        placeholder={DEFAULT_TLS_PORTS}
        invalid={Boolean(errors.ports)}
        autoComplete="off"
        onChange={(event) => set("ports", event.target.value)}
      />
    </Field>
    <Field
      label="Gateway"
      optional
      description={`Use a gateway to reach targets on a private network.${
        isInfisicalCloud()
          ? ""
          : " Self-hosted instances can also set ALLOW_INTERNAL_IP_CONNECTIONS=true to scan private networks without one."
      }`}
      wide
    >
      <GatewayPicker
        label="Gateway"
        noGatewayLabel="No gateway"
        value={{ gatewayId: draft.gatewayId, gatewayPoolId: draft.gatewayPoolId }}
        onChange={(next) => {
          set("gatewayId", next.gatewayId);
          set("gatewayPoolId", next.gatewayPoolId);
        }}
      />
    </Field>
  </Stack>
);

const HostsStep = ({
  draft,
  errors,
  set,
  projectId,
  app,
  connectionLabel,
  capability
}: StepProps & {
  projectId: string;
  app: AppConnection.SSH | AppConnection.WinRM;
  connectionLabel: string;
  capability: GatewayCapability;
}) => {
  const { connections, isPending } = useV4Adapter("pkiDiscovery").useHostConnections(
    [app],
    projectId
  );
  const { data: gateways } = useV4Adapter("networking").useGateways();
  const incapable = new Set(
    (gateways ?? [])
      .filter((gateway) => gateway.capabilities?.[capability] !== true)
      .map((gateway) => gateway.id)
  );
  const unusableReason = (connection: {
    gatewayId?: string | null;
    gatewayPoolId?: string | null;
  }) => {
    if (!connection.gatewayId && !connection.gatewayPoolId) return "No gateway";
    if (connection.gatewayId && incapable.has(connection.gatewayId)) return "Update gateway";
    return undefined;
  };
  const listed = [
    ...connections.filter((connection) => !unusableReason(connection)),
    ...connections.filter((connection) => unusableReason(connection))
  ];
  const missingSelected = draft.connections.filter(
    (selected) => !connections.some((connection) => connection.id === selected.id)
  );
  const options = [
    ...listed.map((connection) => ({
      value: connection.id,
      label: connection.name,
      description: unusableReason(connection),
      disabled: Boolean(unusableReason(connection))
    })),
    ...missingSelected.map((connection) => ({ value: connection.id, label: connection.name }))
  ];
  const names = new Map(options.map((option) => [option.value, option.label]));
  return (
    <Field
      label={`${connectionLabel} connections`}
      description={
        !isPending && !connections.length
          ? `You don't have access to any ${connectionLabel} connections. Ask an admin to create one.`
          : "One connection per server. Only connections that use a gateway can be selected."
      }
      error={errors.connections}
      wide
    >
      <Combobox
        multiple
        label={`${connectionLabel} connections`}
        placeholder="Select connections"
        emptyText={`No ${connectionLabel} connections`}
        disabled={isPending}
        invalid={Boolean(errors.connections)}
        options={options}
        value={draft.connections.map((connection) => connection.id)}
        onValueChange={(ids) =>
          set(
            "connections",
            ids.map((id) => ({ id, name: names.get(id) ?? id }))
          )
        }
      />
    </Field>
  );
};

const FolderListField = ({
  label,
  description,
  value,
  error,
  maxFolders,
  onChange
}: {
  label: string;
  description: string;
  value: string[];
  error?: string;
  maxFolders: number;
  onChange: (value: string[]) => void;
}) => {
  const [tagError, setTagError] = useState<string>();
  const message = tagError ?? error;
  return (
    <Field label={label} description={description} error={message} wide>
      <TagsInput
        mono
        label={label}
        value={value}
        placeholder="Add a folder and press Enter"
        invalid={Boolean(message)}
        validate={(tag, existing) => {
          if (existing.includes(tag)) return "This folder is already in the list";
          if (existing.length >= maxFolders)
            return `Add up to ${maxFolders} ${label.toLowerCase()}`;
          return validateLinuxFolder(tag);
        }}
        onValidationChange={setTagError}
        onValueChange={onChange}
      />
    </Field>
  );
};

const FoldersStep = ({ draft, errors, set }: StepProps) => (
  <Stack gap={16}>
    <FolderListField
      label="Search folders"
      description="Absolute paths searched on every server. Subfolders are included."
      value={draft.searchFolderPaths}
      error={errors.searchFolderPaths}
      maxFolders={MAX_SEARCH_FOLDERS}
      onChange={(next) => set("searchFolderPaths", next)}
    />
    <FolderListField
      label="Skip folders"
      description="Folders left out of the search. /proc, /sys and /dev are always skipped."
      value={draft.skipFolderPaths}
      error={errors.skipFolderPaths}
      maxFolders={MAX_SKIP_FOLDERS}
      onChange={(next) => set("skipFolderPaths", next)}
    />
  </Stack>
);

const OptionsStep = ({ draft, errors, set }: StepProps) => (
  <Stack gap={16}>
    <Field
      label="Folder depth"
      description="How many subfolders deep to search. 1 checks only the files directly inside each search folder."
      error={errors.maxFolderDepth}
      wide
    >
      <Input
        type="number"
        min={1}
        max={MAX_FOLDER_DEPTH}
        value={draft.maxFolderDepth ?? ""}
        invalid={Boolean(errors.maxFolderDepth)}
        onChange={(event) =>
          set("maxFolderDepth", event.target.value === "" ? null : Number(event.target.value))
        }
      />
    </Field>
    <Switch
      layout="row"
      label="Include trust stores and CA bundles"
      description="A leaf certificate always comes in with its chain. Turn this on to also import CA certificates from files that hold no leaf, such as trust bundles."
      checked={draft.importStandaloneCaCertificates}
      onCheckedChange={(checked) => set("importStandaloneCaCertificates", checked)}
    />
  </Stack>
);

const StoreOptions = ({
  stores,
  value,
  disabled,
  onChange
}: {
  stores: WindowsCertificateStore[];
  value: WindowsCertificateStore[];
  disabled?: boolean;
  onChange: (stores: WindowsCertificateStore[]) => void;
}) => {
  const selected = new Set(value);
  return (
    <Stack gap={12}>
      {stores.map((store) => (
        <Checkbox
          key={store}
          label={WindowsCertificateStoreLabels[store]}
          description={STORE_DESCRIPTIONS[store]}
          disabled={disabled}
          checked={selected.has(store)}
          onCheckedChange={(checked) =>
            onChange(
              Object.values(WindowsCertificateStore).filter((entry) =>
                entry === store ? checked === true : selected.has(entry)
              )
            )
          }
        />
      ))}
    </Stack>
  );
};

const StoresStep = ({ draft, errors, set }: StepProps) => (
  <Stack gap={24}>
    <FieldSet legend="Server certificate stores">
      <StoreOptions
        stores={SERVER_STORES}
        value={draft.certificateStores}
        onChange={(next) => set("certificateStores", next)}
      />
    </FieldSet>
    <FieldSet legend="CA certificate stores">
      <Stack gap={16}>
        <Switch
          layout="row"
          label="Include CA certificates"
          description="Import the CA certificates in the selected stores. A leaf certificate always comes in with its chain."
          checked={draft.importStandaloneCaCertificates}
          onCheckedChange={(checked) => {
            set("importStandaloneCaCertificates", checked);
            if (!checked)
              set(
                "certificateStores",
                draft.certificateStores.filter((store) => !CA_CERTIFICATE_STORES.includes(store))
              );
          }}
        />
        <StoreOptions
          stores={CA_CERTIFICATE_STORES}
          value={draft.certificateStores}
          disabled={!draft.importStandaloneCaCertificates}
          onChange={(next) => set("certificateStores", next)}
        />
      </Stack>
    </FieldSet>
    {errors.certificateStores && <FieldError>{errors.certificateStores}</FieldError>}
  </Stack>
);

const DetailsStep = ({ draft, errors, set }: StepProps) => (
  <Stack gap={16}>
    <Field
      label="Name"
      description="Lowercase letters, numbers and hyphens."
      error={errors.name}
      wide
    >
      <Input
        mono
        value={draft.name}
        placeholder="my-discovery-job"
        invalid={Boolean(errors.name)}
        autoComplete="off"
        onChange={(event) => set("name", event.target.value)}
      />
    </Field>
    <Field label="Description" optional error={errors.description} wide>
      <Textarea
        rows={3}
        value={draft.description}
        placeholder="What this job looks for"
        aria-invalid={Boolean(errors.description) || undefined}
        onChange={(event) => set("description", event.target.value)}
      />
    </Field>
    <Switch
      layout="row"
      label="Scan on a schedule"
      description="Turn off to only scan when you start it."
      checked={draft.isAutoScanEnabled}
      onCheckedChange={(checked) => set("isAutoScanEnabled", checked)}
    />
    {draft.isAutoScanEnabled && (
      <Field label="Scan interval" error={errors.scanIntervalDays} wide>
        <Select
          label="Scan interval"
          value={String(draft.scanIntervalDays)}
          options={SCAN_INTERVAL_OPTIONS}
          onValueChange={(next) => set("scanIntervalDays", Number(next))}
        />
      </Field>
    )}
  </Stack>
);

const ReviewStep = ({ draft }: { draft: JobDraft }) => {
  const networking = useV4Adapter("networking");
  const isNetwork = draft.discoveryType === PkiDiscoveryType.Network;
  const { data: gateways } = networking.useGateways();
  const { data: pools } = networking.usePools({
    enabled: isNetwork && Boolean(draft.gatewayPoolId)
  });
  let gatewayLabel = "None";
  if (draft.gatewayPoolId)
    gatewayLabel = pools?.find((pool) => pool.id === draft.gatewayPoolId)?.name ?? "Gateway pool";
  else if (draft.gatewayId)
    gatewayLabel = gateways?.find((gateway) => gateway.id === draft.gatewayId)?.name ?? "Gateway";
  const targets = parseTargets(draft.targets);
  const enabled = (value: boolean) => (value ? "Enabled" : "Disabled");
  const connectionNames = draft.connections.map((connection) => connection.name);
  const items: (readonly [string, React.ReactNode])[] = [
    ["Type", PKI_DISCOVERY_TYPE_MAP[draft.discoveryType].name],
    ["Name", <code key="name">{draft.name}</code>],
    ["Description", draft.description || "None"],
    [
      "Schedule",
      draft.isAutoScanEnabled
        ? (SCAN_INTERVAL_OPTIONS.find((option) => option.value === String(draft.scanIntervalDays))
            ?.label ?? `Every ${draft.scanIntervalDays} days`)
        : "Manual only"
    ]
  ];
  if (isNetwork)
    items.push(
      ["Domains", <BadgeList key="domains" items={targets.domains} max={4} mono />],
      ["IP ranges", <BadgeList key="ips" items={targets.ipRanges} max={4} mono />],
      ["Ports", <code key="ports">{draft.ports}</code>],
      ["Gateway", gatewayLabel]
    );
  if (draft.discoveryType === PkiDiscoveryType.LinuxServer)
    items.push(
      ["SSH connections", <BadgeList key="hosts" items={connectionNames} max={4} />],
      ["Search folders", <BadgeList key="search" items={draft.searchFolderPaths} max={4} mono />],
      ["Skip folders", <BadgeList key="skip" items={draft.skipFolderPaths} max={4} mono />],
      ["Folder depth", String(draft.maxFolderDepth)],
      ["Include trust stores and CA bundles", enabled(draft.importStandaloneCaCertificates)]
    );
  if (draft.discoveryType === PkiDiscoveryType.WindowsServer)
    items.push(
      ["Windows (WinRM) connections", <BadgeList key="hosts" items={connectionNames} max={4} />],
      [
        "Certificate stores",
        <BadgeList
          key="stores"
          items={draft.certificateStores.map((store) => WindowsCertificateStoreLabels[store])}
          max={3}
        />
      ],
      ["Include CA certificates", enabled(draft.importStandaloneCaCertificates)]
    );
  return <DataList variant="props" density="compact" items={items} />;
};

const TYPE_STEP_FIELDS: Record<string, (keyof JobDraft)[]> = {
  targets: ["targets", "ports", "gatewayId", "gatewayPoolId"],
  hosts: ["connections"],
  folders: ["searchFolderPaths", "skipFolderPaths"],
  options: ["maxFolderDepth", "maxFileSizeKb", "importStandaloneCaCertificates"],
  stores: ["certificateStores", "importStandaloneCaCertificates"],
  details: ["name", "description", "isAutoScanEnabled", "scanIntervalDays"]
};

const JobSheet = ({
  projectId,
  discovery,
  onClose
}: {
  projectId: string;
  discovery?: TPkiDiscovery;
  onClose: () => void;
}) => {
  const adapter = useV4Adapter("pkiDiscovery");
  const create = adapter.useCreateDiscovery();
  const update = adapter.useUpdateDiscovery();
  const isEdit = Boolean(discovery);
  const [type, setType] = useState<PkiDiscoveryType | undefined>(discovery?.discoveryType);
  const [initial, setInitial] = useState<JobDraft | undefined>(() =>
    discovery ? jobDraft(discovery.discoveryType, discovery) : undefined
  );
  const [draft, setDraft] = useState<JobDraft | undefined>(initial);
  const [errors, setErrors] = useState<JobErrors>({});
  const [step, setStep] = useState(0);
  const dirty =
    (!isEdit && step > 0) || (draft ? JSON.stringify(draft) !== JSON.stringify(initial) : false);
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: dirty,
    onDiscard: onClose
  });

  const set: StepProps["set"] = (key, value) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const check = (key: string) => () => {
    if (!draft) return false;
    const next = jobErrors(draft, TYPE_STEP_FIELDS[key]);
    setErrors(next);
    return !Object.values(next).some(Boolean);
  };

  const stepProps = draft ? { draft, errors, set } : undefined;
  const typeSteps = (): MultiStepStep[] => {
    if (!stepProps || !type) return [];
    if (type === PkiDiscoveryType.LinuxServer)
      return [
        {
          title: "Hosts",
          description:
            "Pick the SSH connections for the servers to scan. Each connection is one server, scanned from the gateway on that connection.",
          validate: check("hosts"),
          content: (
            <HostsStep
              {...stepProps}
              projectId={projectId}
              app={AppConnection.SSH}
              connectionLabel="SSH"
              capability={GatewayCapability.CertificateScan}
            />
          )
        },
        {
          title: "Where to look",
          description:
            "Only certificate files are opened (.pem, .crt, .cer, .der, .p7b, .pfx, .p12, .jks, .keystore). The SSH user needs read access to these folders; folders it can't read are listed in the scan.",
          validate: check("folders"),
          content: <FoldersStep {...stepProps} />
        },
        {
          title: "Options",
          description:
            "Private keys aren't imported. Keystores protected by a password are listed as locked until you set the password on the installation.",
          validate: check("options"),
          content: <OptionsStep {...stepProps} />
        }
      ];
    if (type === PkiDiscoveryType.WindowsServer)
      return [
        {
          title: "Hosts",
          description:
            "Pick the Windows (WinRM) connections for the servers to scan. Each connection is one server, scanned from the gateway on that connection.",
          validate: check("hosts"),
          content: (
            <HostsStep
              {...stepProps}
              projectId={projectId}
              app={AppConnection.WinRM}
              connectionLabel="Windows (WinRM)"
              capability={GatewayCapability.WindowsCertificateScan}
            />
          )
        },
        {
          title: "Stores",
          description:
            "The scan reads the Local Machine certificate stores. Private keys aren't read or imported.",
          validate: check("stores"),
          content: <StoresStep {...stepProps} />
        }
      ];
    return [
      {
        title: "Targets",
        description:
          "Each target is checked on every port listed. Any certificate served over TLS is imported with its chain.",
        validate: check("targets"),
        content: <TargetsStep {...stepProps} />
      }
    ];
  };

  const pickType = (next: PkiDiscoveryType) => {
    const fresh = jobDraft(next);
    setType(next);
    setInitial(fresh);
    setDraft(fresh);
    setErrors({});
  };

  const steps: MultiStepStep[] = [
    ...(isEdit
      ? []
      : [
          {
            title: "Type",
            heading: "Choose where to look for certificates",
            summary: type ? PKI_DISCOVERY_TYPE_MAP[type].name : undefined,
            disabledReason: type ? undefined : "Choose a discovery type",
            render: ({ next }: { next: () => void }) => (
              <RadioGroup
                columns={3}
                aria-label="Discovery type"
                value={type ?? ""}
                onValueChange={(value) => {
                  if (value !== type) pickType(value as PkiDiscoveryType);
                  next();
                }}
              >
                {Object.values(PkiDiscoveryType).map((entry) => (
                  <RadioGroupCard
                    key={entry}
                    value={entry}
                    media={<DiscoveryTypeIcon type={entry} />}
                    title={PKI_DISCOVERY_TYPE_MAP[entry].name}
                    description={PKI_DISCOVERY_TYPE_MAP[entry].description}
                  />
                ))}
              </RadioGroup>
            )
          } satisfies MultiStepStep
        ]),
    ...typeSteps(),
    ...(stepProps
      ? [
          {
            title: "Details",
            summary: draft?.name || undefined,
            validate: check("details"),
            content: <DetailsStep {...stepProps} />
          },
          ...(isEdit
            ? []
            : [{ title: "Review", content: draft ? <ReviewStep draft={draft} /> : null }])
        ]
      : [])
  ];

  const title = discovery
    ? `Edit ${discovery.name}`
    : `New ${type ? `${PKI_DISCOVERY_TYPE_MAP[type].name.toLowerCase()} ` : ""}discovery job`;

  return (
    <>
      <MultiStep
        variant="sheet"
        size="lg"
        title={title}
        description={
          type ? (
            <DocumentationLink href={getDiscoveryDocsUrl(type)} subject="Certificate discovery" />
          ) : undefined
        }
        open
        step={step}
        onStepChange={setStep}
        onOpenChange={(next) => {
          if (next) return;
          setStep(step);
          requestDiscard();
        }}
        completeLabel={isEdit ? "Save changes" : "Create job"}
        onComplete={async () => {
          if (!draft) return;
          if (discovery)
            await update
              .mutateAsync(updateJobDto(draft, discovery.id))
              .catch(readableFailure("Couldn't update the discovery job."));
          else
            await create
              .mutateAsync(createJobDto(draft, projectId))
              .catch(readableFailure("Couldn't create the discovery job."));
          onClose();
        }}
        steps={steps}
      />
      <DiscardChangesAlertDialog
        {...discardDialogProps}
        title="Discard discovery job?"
        description="Your changes to this discovery job will be lost."
      />
    </>
  );
};

export const DiscoveryJobSheet = ({
  open,
  projectId,
  discovery,
  onClose
}: {
  open: boolean;
  projectId: string;
  discovery?: TPkiDiscovery;
  onClose: () => void;
}) =>
  open ? (
    <JobSheet
      key={discovery?.id ?? "new"}
      projectId={projectId}
      discovery={discovery}
      onClose={onClose}
    />
  ) : null;
