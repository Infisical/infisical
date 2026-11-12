import { useState } from "react";
import { ChevronRightIcon, ExternalLinkIcon, EyeIcon, InfoIcon } from "lucide-react";

import { VariablePermissionCan } from "@app/components/permissions";
import { AwsRegionSelect } from "@app/components/secret-syncs/forms/SecretSyncDestinationFields/shared/AwsRegionSelect";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Code,
  Field,
  FieldDescription,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { OrgPermissionSubjects, useOrganization } from "@app/context";
import { OrgPermissionAppConnectionActions } from "@app/context/OrgPermissionContext/types";
import {
  ProjectPermissionAppConnectionActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { AWS_REGIONS } from "@app/helpers/appConnections";
import { AWS_USE_CASE_GROUPS } from "@app/helpers/awsUseCases";
import { useScopeVariant } from "@app/hooks";
import { useGetAwsProvisioningTemplate } from "@app/hooks/api/appConnections/aws";
import { analytics, AnalyticsEvent } from "@app/lib/analytics";

import { AwsUseCasesSheet } from "./AwsUseCasesSheet";

export type TAwsProvisioningMetadata = {
  launchMethod: "launch-stack";
  useCases: string[];
  stackName: string;
  partition: string;
  templateVersion: string;
  region: string;
  roleName: string;
};

type Props = {
  projectId?: string | null;
  defaultUseCases?: string[];
  onLaunch: (provisioning: TAwsProvisioningMetadata | null) => void;
};

export const AwsPartition = {
  Commercial: "aws",
  GovCloud: "aws-us-gov",
  China: "aws-cn",
  EuropeanSovereignCloud: "aws-eusc"
} as const;

const PARTITIONS = [
  { slug: AwsPartition.Commercial, name: "AWS Commercial" },
  { slug: AwsPartition.EuropeanSovereignCloud, name: "AWS European Sovereign Cloud" },
  { slug: AwsPartition.GovCloud, name: "AWS GovCloud (US)" },
  { slug: AwsPartition.China, name: "AWS China" }
];

// Kept out of AWS_REGIONS: that list feeds sync, rotation and session log forms whose APIs accept
// only AWSRegion, which has no China or European Sovereign Cloud regions.
const PARTITION_ONLY_REGIONS: typeof AWS_REGIONS = [
  { name: "China (Beijing)", slug: "cn-north-1" },
  { name: "China (Ningxia)", slug: "cn-northwest-1" },
  { name: "Europe (Germany) - European Sovereign Cloud", slug: "eusc-de-east-1" }
];

export const PARTITION_REGIONS: Record<string, typeof AWS_REGIONS> = {
  [AwsPartition.Commercial]: AWS_REGIONS.filter(({ slug }) => !slug.startsWith("us-gov-")),
  [AwsPartition.GovCloud]: AWS_REGIONS.filter(({ slug }) => slug.startsWith("us-gov-")),
  [AwsPartition.China]: PARTITION_ONLY_REGIONS.filter(({ slug }) => slug.startsWith("cn-")),
  [AwsPartition.EuropeanSovereignCloud]: PARTITION_ONLY_REGIONS.filter(({ slug }) =>
    slug.startsWith("eusc-")
  )
};

const DEFAULT_REGIONS: Record<string, string> = {
  [AwsPartition.Commercial]: "us-east-1",
  [AwsPartition.GovCloud]: "us-gov-east-1",
  [AwsPartition.China]: "cn-north-1",
  [AwsPartition.EuropeanSovereignCloud]: "eusc-de-east-1"
};

const DEFAULT_USE_CASE = "secrets-manager";
const DEFAULT_STACK_NAME = "infisical-aws-app-connection";
const DEFAULT_ROLE_NAME = "infisical-app-connection";

const generateSuffix = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(3)), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

export const MANUAL_DOCS_URL = "https://infisical.com/docs/integrations/app-connections/aws";

const ManualRoleCreation = ({ reason }: { reason: string }) => (
  <Alert variant="info" className="mb-4">
    <InfoIcon />
    <AlertTitle>Create the role manually</AlertTitle>
    <AlertDescription>
      <p>
        {reason} Create an IAM role that trusts Infisical, then paste its ARN into the Role ARN
        field below.{" "}
        <a
          href={MANUAL_DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 underline"
        >
          Manual role creation steps
          <ExternalLinkIcon className="size-3" />
        </a>
      </p>
    </AlertDescription>
  </Alert>
);

const LaunchStackBody = ({
  projectId,
  partition,
  region,
  useCases,
  stackName,
  roleName,
  onLaunch
}: {
  projectId?: string | null;
  partition: string;
  region: string;
  useCases: string[];
  stackName: string;
  roleName: string;
  onLaunch: Props["onLaunch"];
}) => {
  const { currentOrg } = useOrganization();
  const scopeVariant = useScopeVariant();
  const [hasLaunched, setHasLaunched] = useState(false);

  const { data: template, isError } = useGetAwsProvisioningTemplate(
    { projectId, partition, region, useCases, stackName, roleName },
    { enabled: partition === AwsPartition.Commercial && useCases.length > 0 }
  );

  if (partition !== AwsPartition.Commercial) {
    return (
      <ManualRoleCreation reason="Launch Stack is only available for the commercial AWS partition." />
    );
  }

  if (isError || template === null) {
    return (
      <ManualRoleCreation reason="Infisical couldn't prepare a Launch Stack link for this setup." />
    );
  }

  const handleLaunch = () => {
    if (!template) return;

    analytics.captureForOrganization(AnalyticsEvent.AwsLaunchStackClicked, currentOrg.id, {
      scope: projectId ? "project" : "org",
      partition: AwsPartition.Commercial,
      useCaseCount: useCases.length
    });
    onLaunch({
      launchMethod: "launch-stack",
      useCases,
      stackName: template.stackName,
      partition: template.partition,
      templateVersion: template.templateVersion,
      region: template.region,
      roleName
    });
    window.open(template.launchUrl, "_blank", "noopener,noreferrer");
  };

  const steps = [
    "Review the prefilled stack in the AWS CloudFormation console and create it.",
    <>
      When the stack finishes, open its <strong>Outputs</strong> tab.
    </>,
    <>
      Copy the <Code>{template?.outputKey ?? "RoleArn"}</Code> value and paste it into the Role ARN
      field below.
    </>
  ];

  return (
    <div className="flex flex-col gap-4">
      <Button
        type="button"
        variant={scopeVariant}
        className="self-start"
        onClick={() => {
          handleLaunch();
          setHasLaunched(true);
        }}
        isDisabled={!template || useCases.length === 0}
      >
        Launch Stack in AWS
        <ExternalLinkIcon />
      </Button>
      {hasLaunched && (
        <ol className="flex flex-col gap-3 rounded-md border border-border bg-container p-4 text-sm text-foreground-soft">
          {steps.map((step, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <li key={index} className="flex items-start gap-3">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-border text-xs font-medium text-foreground">
                {index + 1}
              </span>
              <span className="min-w-0 pt-px">{step}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

export const AwsLaunchStack = ({ projectId, defaultUseCases, onLaunch }: Props) => {
  const [partition, setPartition] = useState<string>(AwsPartition.Commercial);
  const [region, setRegion] = useState("us-east-1");
  const [useCases, setUseCases] = useState<string[]>(() =>
    defaultUseCases?.length ? defaultUseCases : [DEFAULT_USE_CASE]
  );
  const [suffix] = useState(generateSuffix);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [sheetView, setSheetView] = useState<"list" | "policy">("list");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const selectedLabels = AWS_USE_CASE_GROUPS.flatMap((group): { id: string; label: string }[] => [
    ...group.options
  ])
    .filter(({ id }) => useCases.includes(id))
    .map(({ label }) => label);

  const openSheet = (view: "list" | "policy") => {
    setSheetView(view);
    setIsSheetOpen(true);
  };

  const toggleUseCase = (id: string, isChecked: boolean) => {
    onLaunch(null);
    setUseCases((current) =>
      isChecked ? [...current.filter((item) => item !== id), id] : current.filter((i) => i !== id)
    );
  };

  const handlePartitionChange = (value: string) => {
    onLaunch(null);
    setPartition(value);
    setRegion(DEFAULT_REGIONS[value]);
  };

  return (
    <VariablePermissionCan
      type={projectId ? "project" : "org"}
      I={
        projectId
          ? ProjectPermissionAppConnectionActions.Create
          : OrgPermissionAppConnectionActions.Create
      }
      a={projectId ? ProjectPermissionSub.AppConnections : OrgPermissionSubjects.AppConnections}
    >
      {(isAllowed) =>
        isAllowed ? (
          <div className="mb-4 flex flex-col gap-6">
            <Button
              type="button"
              variant="text"
              size="xs"
              className="self-start"
              aria-expanded={showAdvanced}
              onClick={() => setShowAdvanced((v) => !v)}
            >
              <ChevronRightIcon
                className={`transition-transform ${showAdvanced ? "rotate-90" : ""}`}
              />
              Advanced: {PARTITIONS.find(({ slug }) => slug === partition)?.name}
              {partition === AwsPartition.Commercial &&
                `, ${PARTITION_REGIONS[partition].find(({ slug }) => slug === region)?.name ?? region} (${region})`}
            </Button>
            <div className={showAdvanced ? "flex flex-col gap-6" : "hidden"}>
              <Field>
                <FieldLabel>Partition</FieldLabel>
                <Select value={partition} onValueChange={handlePartitionChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {PARTITIONS.map(({ slug, name }) => (
                      <SelectItem key={slug} value={slug}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {partition === AwsPartition.Commercial && (
                <Field>
                  <FieldLabel htmlFor="aws-stack-region">Stack region</FieldLabel>
                  <AwsRegionSelect
                    id="aws-stack-region"
                    value={region}
                    onChange={(value) => {
                      if (!value) return;
                      onLaunch(null);
                      setRegion(value);
                    }}
                    regions={PARTITION_REGIONS[partition]}
                  />
                </Field>
              )}
            </div>
            {partition === AwsPartition.Commercial && (
              <Field>
                <FieldLabel>Role permissions</FieldLabel>
                <div className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
                  <div className="min-w-0 text-sm">
                    {selectedLabels.length > 0 ? (
                      <p>
                        {selectedLabels.slice(0, 2).join(", ")}
                        {selectedLabels.length > 2 && (
                          <span className="text-muted"> +{selectedLabels.length - 2} more</span>
                        )}
                      </p>
                    ) : (
                      <p className="text-muted">Select at least one use case.</p>
                    )}
                    <Button
                      type="button"
                      variant="link"
                      size="xs"
                      className="mt-1"
                      onClick={() => openSheet("list")}
                    >
                      Customize
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    isDisabled={useCases.length === 0}
                    onClick={() => openSheet("policy")}
                  >
                    <EyeIcon />
                    View policy
                  </Button>
                </div>
                <FieldDescription>
                  The role is created with permissions for the selected use cases only.
                </FieldDescription>
              </Field>
            )}
            <AwsUseCasesSheet
              isOpen={isSheetOpen}
              onOpenChange={setIsSheetOpen}
              initialView={sheetView}
              selected={useCases}
              lockedIds={defaultUseCases ?? []}
              onToggle={toggleUseCase}
            />
            <LaunchStackBody
              key={`${partition}:${region}:${[...useCases].sort().join(",")}`}
              projectId={projectId}
              partition={partition}
              region={region}
              useCases={useCases}
              stackName={`${DEFAULT_STACK_NAME}-${suffix}`}
              roleName={`${DEFAULT_ROLE_NAME}-${suffix}`}
              onLaunch={onLaunch}
            />
          </div>
        ) : (
          <ManualRoleCreation reason="You don't have permission to create app connections, so a Launch Stack link isn't available." />
        )
      }
    </VariablePermissionCan>
  );
};
