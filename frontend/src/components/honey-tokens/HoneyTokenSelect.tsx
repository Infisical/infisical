import { AlertTriangle, Loader2Icon } from "lucide-react";

import { Alert, AlertAction, AlertDescription, Button } from "@app/components/v3";
import { ProviderIcon } from "@app/components/v3/platform/ProviderIcon";
import { useProject } from "@app/context";
import { HONEY_TOKEN_HOSTING_MAP, HONEY_TOKEN_MAP } from "@app/helpers/honeyTokens";
import { isInfisicalCloud } from "@app/helpers/platform";
import { useGetHoneyTokenHostingOptions } from "@app/hooks/api/honeyTokens";
import {
  HoneyTokenHosting,
  HoneyTokenManagedUnavailableReason,
  HoneyTokenType
} from "@app/hooks/api/honeyTokens/enums";

export type THoneyTokenSelection = {
  type: HoneyTokenType;
  hosting: HoneyTokenHosting;
};

type Props = {
  onSelect: (selection: THoneyTokenSelection) => void;
};

// Self-hosted users are told which setting is missing so they can pass it to whoever runs the
// instance. On Infisical Cloud the instance settings are ours, so an env var name would mean nothing.
const getManagedUnavailableDescription = (reason: HoneyTokenManagedUnavailableReason | null) => {
  if (isInfisicalCloud()) {
    return "Temporarily unavailable. Contact support if this persists.";
  }

  switch (reason) {
    case HoneyTokenManagedUnavailableReason.IncompleteAwsCredentials:
      return "Not available on this instance: HONEY_TOKEN_MANAGED_AWS_ACCESS_KEY_ID and HONEY_TOKEN_MANAGED_AWS_SECRET_ACCESS_KEY must be set together. Ask your instance administrator to fix this.";
    case HoneyTokenManagedUnavailableReason.InvalidRoleArn:
      return "Not available on this instance: HONEY_TOKEN_MANAGED_AWS_ROLE_ARN must be an IAM role ARN (arn:aws:iam::<account-id>:role/<name>). Ask your instance administrator to fix this.";
    default:
      return "Not available on this instance. Ask your instance administrator to check the managed honey token settings.";
  }
};

const ProviderCard = ({
  type,
  hosting,
  description,
  isDisabled,
  onClick
}: THoneyTokenSelection & {
  description: string;
  isDisabled?: boolean;
  onClick: () => void;
}) => {
  const { name, image } = HONEY_TOKEN_MAP[type];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isDisabled}
      className="group flex cursor-pointer flex-col gap-3 rounded-md border border-border bg-card p-4 text-left transition-colors hover:border-border-strong hover:bg-surface-hover/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-card"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-hover">
        <ProviderIcon icon={image} alt={`${name} logo`} className="h-6 w-6 object-contain" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-foreground">
          {name}: {HONEY_TOKEN_HOSTING_MAP[hosting].name}
        </p>
        <p className="text-xs leading-relaxed text-muted">{description}</p>
      </div>
    </button>
  );
};

export const HoneyTokenSelect = ({ onSelect }: Props) => {
  const { currentProject } = useProject();
  const {
    data: hostingOptions,
    isPending,
    isError,
    isFetching,
    refetch
  } = useGetHoneyTokenHostingOptions({
    projectId: currentProject.id,
    type: HoneyTokenType.AWS
  });

  if (isPending) {
    return (
      <div className="flex h-full flex-col items-center justify-center py-10">
        <Loader2Icon className="size-8 animate-spin text-accent" />
        <p className="mt-4 text-sm text-muted">Loading options...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="danger">
        <AlertTriangle />
        <AlertDescription className="text-xs">
          <span>Couldn&apos;t load where this honey token can be created.</span>
          <AlertAction>
            <Button variant="danger" size="xs" isPending={isFetching} onClick={() => refetch()}>
              Retry
            </Button>
          </AlertAction>
        </AlertDescription>
      </Alert>
    );
  }

  const { isAvailable: isManagedAvailable, unavailableReason } = hostingOptions.infisicalManaged;
  // An instance that never set up managed honey tokens only has the customer's own account. A
  // misconfigured one still shows the managed option, with the reason it is unavailable.
  const isManagedShown = unavailableReason !== HoneyTokenManagedUnavailableReason.NotConfigured;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      {isManagedShown && (
        <ProviderCard
          type={HoneyTokenType.AWS}
          hosting={HoneyTokenHosting.InfisicalManaged}
          description={
            isManagedAvailable
              ? HONEY_TOKEN_HOSTING_MAP[HoneyTokenHosting.InfisicalManaged].description
              : getManagedUnavailableDescription(unavailableReason)
          }
          isDisabled={!isManagedAvailable}
          onClick={() =>
            onSelect({ type: HoneyTokenType.AWS, hosting: HoneyTokenHosting.InfisicalManaged })
          }
        />
      )}
      <ProviderCard
        type={HoneyTokenType.AWS}
        hosting={HoneyTokenHosting.CustomerAccount}
        description={HONEY_TOKEN_HOSTING_MAP[HoneyTokenHosting.CustomerAccount].description}
        onClick={() =>
          onSelect({ type: HoneyTokenType.AWS, hosting: HoneyTokenHosting.CustomerAccount })
        }
      />
    </div>
  );
};
