import { ReactNode, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { ExternalLinkIcon, EyeIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { AwsRegionSelect } from "@app/components/secret-syncs/forms/SecretSyncDestinationFields/shared/AwsRegionSelect";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Code,
  CopyButton,
  Field,
  FieldDescription,
  FieldLabel,
  Skeleton
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import { AWS_REGIONS } from "@app/helpers/appConnections";
import { getAwsUseCaseLabel } from "@app/helpers/awsUseCases";
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

import { AwsPartition, MANUAL_DOCS_URL, PARTITION_REGIONS } from "./AwsLaunchStack";
import { AwsUseCasesSheet } from "./AwsUseCasesSheet";

type Props = {
  projectId?: string | null;
  connectionId: string;
  provisioning: TAwsConnectionProvisioning;
  preselectedUseCases?: string[];
};

const isSameSelection = (a: string[], b: string[]) =>
  a.length === b.length && a.every((id) => b.includes(id));

const getErrorMessage = (error: unknown) => {
  if (!axios.isAxiosError<{ message?: unknown }>(error)) return null;
  const message = error.response?.data?.message;
  return typeof message === "string" && message ? message : null;
};

const GENERIC_REASON = "Infisical could not prepare the update steps for this connection.";

const NOT_STACK_MANAGED_REASON =
  "Infisical prepares update steps only for stacks in the commercial AWS partition that it launched, and this connection's stack is not one.";

const UpdateStackFallback = ({ reason }: { reason: string }) => (
  <Alert variant="info">
    <InfoIcon />
    <AlertTitle>Update the stack manually</AlertTitle>
    <AlertDescription>
      <p>
        {reason} Update the stack in the AWS console by following the manual steps, then come back
        to record the change.{" "}
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

const UpdateStackSteps = ({
  projectId,
  template,
  useCaseCount,
  isPending,
  onMarkAsUpdated
}: {
  projectId?: string | null;
  template: TAwsUpdateProvisioningTemplate;
  useCaseCount: number;
  isPending: boolean;
  onMarkAsUpdated: () => void;
}) => {
  const { currentOrg } = useOrganization();
  const scopeVariant = useScopeVariant();
  const regionName = AWS_REGIONS.find(({ slug }) => slug === template.region)?.name;
  const toggles = Object.entries(template.parameters).sort(([a], [b]) => a.localeCompare(b));

  const handleOpenStack = () => {
    analytics.captureForOrganization(AnalyticsEvent.AwsUpdateStackClicked, currentOrg.id, {
      scope: projectId ? "project" : "org",
      useCaseCount
    });
  };

  const steps: ReactNode[] = [
    <>
      Open the stack <Code>{template.stackName}</Code> in{" "}
      {regionName ? `${regionName} (${template.region})` : template.region} in the AWS
      CloudFormation console.{" "}
      <a
        href={template.stackUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 underline"
        onClick={handleOpenStack}
      >
        Open stack in AWS
        <ExternalLinkIcon className="size-3" />
      </a>
    </>,
    <>
      Select <strong>Update stack</strong>, then <strong>Make a direct update</strong>. Choose{" "}
      <strong>Replace existing template</strong> and <strong>Amazon S3 URL</strong>, and paste the
      Provisioning template URL.
      <span className="mt-2 flex items-center gap-1 rounded-sm bg-foreground/10 py-0.5 pr-0.5 pl-2">
        <Code variant="plain" className="min-w-0 flex-1 text-xs break-all">
          {template.templateUrl}
        </Code>
        <CopyButton value={template.templateUrl} ariaLabel="Copy Provisioning template URL" />
      </span>
    </>,
    <>
      On the <strong>Specify stack details</strong> page, change only these parameters.
      {toggles.length > 0 && (
        <span className="mt-2 flex flex-col gap-1">
          {toggles.map(([name, value]) => (
            <span key={name}>
              <Code>{name}</Code> to <Code>{value}</Code>
            </span>
          ))}
        </span>
      )}
      {template.companionParameters.length > 0 && (
        <>
          <span className="mt-3 block">
            Also enter a value for each of these parameters. The use cases you added need them.
          </span>
          <span className="mt-2 flex flex-col gap-1">
            {template.companionParameters.map((name) => (
              <span key={name}>
                <Code>{name}</Code>
              </span>
            ))}
          </span>
        </>
      )}
      <span className="mt-3 block">
        Leave every other parameter on its existing value, including the External ID, the trusted
        account and the role name.
      </span>
    </>,
    <>
      Submit the update and wait for the stack to reach <Code>UPDATE_COMPLETE</Code>.
    </>,
    <>
      Return here and select <strong>Mark as updated</strong>.
    </>
  ];

  return (
    <div className="flex flex-col gap-4">
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
      <div className="flex flex-col items-start gap-2">
        <Button
          type="button"
          variant={scopeVariant}
          isPending={isPending}
          onClick={onMarkAsUpdated}
        >
          Mark as updated
        </Button>
        <p className="text-xs text-muted">
          Infisical does not check AWS. This saves the use cases you selected as the record for this
          connection.
        </p>
      </div>
    </div>
  );
};

export const AwsUpdateStack = ({
  projectId,
  connectionId,
  provisioning,
  preselectedUseCases
}: Props) => {
  const queryClient = useQueryClient();
  const updateAppConnection = useUpdateAppConnection();
  const [recorded, setRecorded] = useState(provisioning);
  const [useCases, setUseCases] = useState<string[]>(() => [
    ...provisioning.useCases,
    ...(preselectedUseCases ?? []).filter((id) => !provisioning.useCases.includes(id))
  ]);
  const [chosenRegion, setChosenRegion] = useState("");
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [sheetView, setSheetView] = useState<"list" | "policy">("list");

  const isRegionMissing = !recorded.region;
  const hasRegion = !isRegionMissing || Boolean(chosenRegion);
  const isChanged = !isSameSelection(useCases, recorded.useCases);
  const hasNoUseCases = useCases.length === 0;
  const removedUseCases = recorded.useCases.filter((id) => !useCases.includes(id));
  const selectedLabels = useCases.map(getAwsUseCaseLabel);

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

  const openSheet = (view: "list" | "policy") => {
    setSheetView(view);
    setIsSheetOpen(true);
  };

  const toggleUseCase = (id: string, isChecked: boolean) => {
    setUseCases((current) =>
      isChecked ? [...current.filter((item) => item !== id), id] : current.filter((i) => i !== id)
    );
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
          setRecorded(
            (connection as TAwsConnection).configuration?.provisioning ?? updatedProvisioning
          );
          createNotification({
            text: "Updated the recorded use cases for this AWS connection",
            type: "success"
          });
        }
      }
    );
  };

  const renderSteps = () => {
    if (!isChanged) {
      return (
        <p className="text-sm text-muted">
          Select or clear use cases to see the steps for updating the stack.
        </p>
      );
    }

    if (hasNoUseCases) {
      return (
        <p className="text-sm text-muted">
          Select at least one use case. Infisical cannot prepare update steps for a stack with none.
        </p>
      );
    }

    if (!hasRegion) return null;

    if (isFetching) return <Skeleton className="h-40 w-full" />;

    if (isError) {
      const message = getErrorMessage(error);
      const reason = message ? `${message}${/[.!?]$/.test(message) ? "" : "."}` : GENERIC_REASON;
      return <UpdateStackFallback reason={reason} />;
    }

    if (template === null) return <UpdateStackFallback reason={NOT_STACK_MANAGED_REASON} />;

    if (!template) return <UpdateStackFallback reason={GENERIC_REASON} />;

    return (
      <UpdateStackSteps
        projectId={projectId}
        template={template}
        useCaseCount={useCases.length}
        isPending={updateAppConnection.isPending}
        onMarkAsUpdated={handleMarkAsUpdated}
      />
    );
  };

  return (
    <Accordion
      type="single"
      collapsible
      className="mb-4"
      defaultValue={preselectedUseCases?.length ? "update-stack" : undefined}
    >
      <AccordionItem value="update-stack">
        <AccordionTrigger>Update Stack</AccordionTrigger>
        <AccordionContent className="flex flex-col gap-4 px-4 pb-4">
          <p className="text-sm text-muted">
            Choose the use cases this role should cover, then update the stack in the AWS console.
            Infisical does not change the stack for you.
          </p>
          <Field>
            <FieldLabel>Role permissions</FieldLabel>
            <div className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
              <div className="min-w-0 text-sm">
                <p>
                  {selectedLabels.slice(0, 2).join(", ")}
                  {selectedLabels.length > 2 && (
                    <span className="text-muted"> +{selectedLabels.length - 2} more</span>
                  )}
                </p>
                <button
                  type="button"
                  className="mt-1 inline-flex items-center text-xs text-muted underline hover:text-foreground"
                  onClick={() => openSheet("list")}
                >
                  Customize
                </button>
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
              Starts from the use cases recorded for this connection.
            </FieldDescription>
          </Field>
          <AwsUseCasesSheet
            isOpen={isSheetOpen}
            onOpenChange={setIsSheetOpen}
            initialView={sheetView}
            selected={useCases}
            lockedIds={[]}
            onToggle={toggleUseCase}
          />
          {removedUseCases.length > 0 && (
            <Alert variant="warning">
              <TriangleAlertIcon />
              <AlertTitle>Permissions will be removed</AlertTitle>
              <AlertDescription>
                <p>
                  Updating the stack removes the permissions for{" "}
                  {removedUseCases.map(getAwsUseCaseLabel).join(", ")} from the role. Features that
                  rely on them will fail.
                </p>
              </AlertDescription>
            </Alert>
          )}
          {isRegionMissing && isChanged && (
            <Field>
              <FieldLabel htmlFor="aws-update-stack-region">Stack region</FieldLabel>
              <AwsRegionSelect
                id="aws-update-stack-region"
                value={chosenRegion}
                onChange={(value) => setChosenRegion(value ?? "")}
                regions={
                  PARTITION_REGIONS[recorded.partition] ??
                  PARTITION_REGIONS[AwsPartition.Commercial]
                }
              />
              <FieldDescription>
                Infisical has no record of the region this stack was created in. Choose it so the
                steps open the right stack.
              </FieldDescription>
            </Field>
          )}
          {renderSteps()}
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};
