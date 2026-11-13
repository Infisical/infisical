import { ReactNode, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { ExternalLinkIcon, InfoIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { AwsRegionSelect } from "@app/components/secret-syncs/forms/SecretSyncDestinationFields/shared/AwsRegionSelect";
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldDescription,
  FieldLabel,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  AWS_COMPANION_PARAMETER_LABELS,
  AWS_OPTIONAL_PARAMETERS,
  getAwsUseCaseLabel
} from "@app/helpers/awsUseCases";
import { useScopeVariant } from "@app/hooks";
import {
  TAwsConnection,
  TAwsConnectionProvisioning,
  useUpdateAppConnection
} from "@app/hooks/api/appConnections";
import {
  awsConnectionKeys,
  TAwsUpdateProvisioningTemplate,
  useGetAwsConnectionProvisioningTemplate
} from "@app/hooks/api/appConnections/aws";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { analytics, AnalyticsEvent } from "@app/lib/analytics";

import { useAppConnectionForm } from "./AppConnectionFormContext";
import { AwsPartition, MANUAL_DOCS_URL, PARTITION_REGIONS } from "./AwsLaunchStack";
import { AwsUseCasesSheet } from "./AwsUseCasesSheet";

type Props = {
  projectId?: string | null;
  connectionId: string;
  provisioning: TAwsConnectionProvisioning;
  preselectedUseCases?: string[];
  onSavingChange?: (isSaving: boolean) => void;
};

const isSameSelection = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

const getErrorMessage = (error: unknown) => {
  if (!axios.isAxiosError<{ message?: unknown }>(error)) return null;
  const message = error.response?.data?.message;
  return typeof message === "string" && message ? message : null;
};

const GENERIC_REASON = "Infisical could not prepare the update for this connection.";

const NOT_STACK_MANAGED_REASON =
  "Infisical prepares updates only for stacks in the commercial AWS partition that it launched, and this connection's stack is not one.";

const UpdateStackFallback = ({ reason }: { reason: string }) => (
  <Alert variant="info">
    <InfoIcon />
    <AlertDescription>
      <p>
        {reason} Update the stack in AWS yourself, then come back to record the change.{" "}
        <a
          href={MANUAL_DOCS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 underline"
        >
          Manual steps
          <ExternalLinkIcon className="size-3" />
        </a>
      </p>
    </AlertDescription>
  </Alert>
);

const ParameterRow = ({ title, action }: { title: string; action: ReactNode }) => (
  <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
    <span className="min-w-0">{title}</span>
    <span className="shrink-0 text-xs text-accent">{action}</span>
  </li>
);

const UpdateInstructions = ({
  template,
  hasRemovals
}: {
  template: TAwsUpdateProvisioningTemplate;
  hasRemovals: boolean;
}) => (
  <div className="flex flex-col gap-2">
    <p className="text-xs text-accent">In AWS, change only these parameters:</p>
    <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
      {template.parameterChanges.map(({ useCase, parameter, value }) => (
        <ParameterRow
          key={parameter}
          title={getAwsUseCaseLabel(useCase)}
          action={<Badge variant={value === "true" ? "success" : "warning"}>{value}</Badge>}
        />
      ))}
      {template.companionParameters.map((name) => (
        <ParameterRow
          key={name}
          title={AWS_COMPANION_PARAMETER_LABELS[name] ?? name}
          action="Enter a value in AWS"
        />
      ))}
    </ul>
    {(template.optionalParameters?.length ?? 0) > 0 && (
      <>
        <p className="text-xs text-accent">Depending on your setup, also check:</p>
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {template.optionalParameters.map((name) => (
            <ParameterRow
              key={name}
              title={AWS_OPTIONAL_PARAMETERS[name]?.label ?? name}
              action={AWS_OPTIONAL_PARAMETERS[name]?.action ?? "Optional"}
            />
          ))}
        </ul>
      </>
    )}
    {hasRemovals && (
      <p className="text-xs text-warning">Features that use removed permissions will fail.</p>
    )}
  </div>
);

export const AwsUpdateStack = ({
  projectId,
  connectionId,
  provisioning,
  preselectedUseCases,
  onSavingChange
}: Props) => {
  const queryClient = useQueryClient();
  const { onPendingChange } = useAppConnectionForm();
  const { currentOrg } = useOrganization();
  const scopeVariant = useScopeVariant();
  const updateAppConnection = useUpdateAppConnection();
  const [recorded, setRecorded] = useState(provisioning);
  const [useCases, setUseCases] = useState<string[]>(() => [
    ...provisioning.useCases,
    ...(preselectedUseCases ?? []).filter((id) => !provisioning.useCases.includes(id))
  ]);
  const [chosenRegion, setChosenRegion] = useState("");
  const [hasOpenedAws, setHasOpenedAws] = useState(false);
  const [hasCustomized, setHasCustomized] = useState(false);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const isRegionMissing = !recorded.region;
  const hasRegion = !isRegionMissing || Boolean(chosenRegion);
  const isChanged = !isSameSelection(useCases, recorded.useCases);
  const hasNoUseCases = useCases.length === 0;
  const removedUseCases = recorded.useCases.filter((id) => !useCases.includes(id));
  const addedUseCases = useCases.filter((id) => !recorded.useCases.includes(id));

  const {
    data: template,
    error,
    isError,
    isFetching
  } = useGetAwsConnectionProvisioningTemplate(
    {
      connectionId,
      useCases: [...useCases].sort(),
      region: isRegionMissing ? chosenRegion : undefined
    },
    { enabled: isChanged && hasRegion && !hasNoUseCases }
  );

  const toggleUseCase = (id: string, isChecked: boolean) => {
    setHasOpenedAws(false);
    setHasCustomized(true);
    setUseCases((current) =>
      isChecked ? [...current.filter((item) => item !== id), id] : current.filter((i) => i !== id)
    );
  };

  const handleOpenAws = () => {
    if (!template) return;

    analytics.captureForOrganization(AnalyticsEvent.AwsUpdateStackClicked, currentOrg.id, {
      scope: projectId ? "project" : "org",
      useCaseCount: useCases.length
    });
    window.open(template.updateUrl, "_blank", "noopener,noreferrer");
    setHasOpenedAws(true);
  };

  const setSaving = (isSaving: boolean) => {
    onPendingChange?.(isSaving);
    onSavingChange?.(isSaving);
  };

  const handleMarkAsUpdated = () => {
    if (!template || hasNoUseCases) return;

    const updatedProvisioning: TAwsConnectionProvisioning = {
      launchMethod: recorded.launchMethod,
      useCases,
      stackName: template.stackName,
      partition: template.partition,
      templateVersion: template.templateVersion,
      region: template.region,
      roleName: recorded.roleName
    };

    setSaving(true);
    updateAppConnection.mutate(
      {
        connectionId,
        app: AppConnection.AWS,
        configuration: { provisioning: updatedProvisioning }
      },
      {
        onSuccess: (connection) => {
          queryClient.invalidateQueries({
            queryKey: awsConnectionKeys.allConnectionProvisioningTemplates()
          });
          const nextProvisioning =
            (connection as TAwsConnection).configuration?.provisioning ?? updatedProvisioning;
          setRecorded(nextProvisioning);
          setUseCases(nextProvisioning.useCases);
          setHasOpenedAws(false);
          setHasCustomized(false);
          createNotification({
            text: "Updated the recorded use cases for this AWS connection",
            type: "success"
          });
        },
        onSettled: () => setSaving(false)
      }
    );
  };

  const renderChanges = () => {
    if (!isChanged) {
      return hasCustomized ? (
        <p className="text-xs text-accent">This role already has these permissions.</p>
      ) : null;
    }

    if (hasNoUseCases) {
      return <p className="text-xs text-accent">Select at least one use case.</p>;
    }

    if (!hasRegion) return null;

    if (isFetching) return <Skeleton className="h-24 w-full" />;

    if (isError) {
      const message = getErrorMessage(error);
      const reason = message ? `${message}${/[.!?]$/.test(message) ? "" : "."}` : GENERIC_REASON;
      return <UpdateStackFallback reason={reason} />;
    }

    if (template === null) return <UpdateStackFallback reason={NOT_STACK_MANAGED_REASON} />;

    if (!template) return <UpdateStackFallback reason={GENERIC_REASON} />;

    return (
      <>
        <UpdateInstructions template={template} hasRemovals={removedUseCases.length > 0} />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={hasOpenedAws ? "outline" : scopeVariant}
            isDisabled={updateAppConnection.isPending}
            onClick={handleOpenAws}
          >
            Update stack in AWS
            <ExternalLinkIcon />
          </Button>
          <Button
            type="button"
            variant={hasOpenedAws ? scopeVariant : "outline"}
            isDisabled={!hasOpenedAws}
            isPending={updateAppConnection.isPending}
            onClick={handleMarkAsUpdated}
          >
            Mark as updated
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <InfoIcon className="size-4 text-accent" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Infisical does not check AWS. This saves the selected use cases as the record for this
              connection.
            </TooltipContent>
          </Tooltip>
        </div>
      </>
    );
  };

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="text-base leading-snug">Role permissions</CardTitle>
        <CardDescription>Use cases this role covers.</CardDescription>
        <CardAction>
          <Button
            type="button"
            variant="outline"
            size="xs"
            isDisabled={updateAppConnection.isPending}
            onClick={() => setIsSheetOpen(true)}
          >
            Customize
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-1.5">
          {recorded.useCases.map((id) =>
            removedUseCases.includes(id) ? (
              <Badge key={id} variant="warning" className="line-through">
                {getAwsUseCaseLabel(id)}
              </Badge>
            ) : (
              <Badge key={id} variant="neutral">
                {getAwsUseCaseLabel(id)}
              </Badge>
            )
          )}
          {addedUseCases.map((id) => (
            <Badge key={id} variant="success">
              + {getAwsUseCaseLabel(id)}
            </Badge>
          ))}
        </div>
        {isRegionMissing && isChanged && (
          <Field>
            <FieldLabel htmlFor="aws-update-stack-region">Stack region</FieldLabel>
            <AwsRegionSelect
              id="aws-update-stack-region"
              value={chosenRegion}
              onChange={(value) => {
                setHasOpenedAws(false);
                setChosenRegion(value ?? "");
              }}
              regions={
                PARTITION_REGIONS[recorded.partition] ?? PARTITION_REGIONS[AwsPartition.Commercial]
              }
            />
            <FieldDescription>The region this stack was created in.</FieldDescription>
          </Field>
        )}
        {renderChanges()}
      </CardContent>
      <AwsUseCasesSheet
        isOpen={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        initialView="list"
        selected={useCases}
        lockedIds={[]}
        onToggle={toggleUseCase}
      />
    </Card>
  );
};
