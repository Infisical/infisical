import { useState } from "react";
import { Helmet } from "react-helmet";
import { Link, useParams } from "@tanstack/react-router";
import {
  ArchiveIcon,
  CheckCircle2Icon,
  CheckIcon,
  ChevronLeftIcon,
  ClockIcon,
  CopyIcon,
  KeyRoundIcon,
  LoaderIcon,
  type LucideIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  UsersIcon,
  XCircleIcon
} from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { Input, Select, SelectItem } from "@app/components/v2";
import {
  Badge,
  Button,
  Detail,
  DetailGroup,
  DetailLabel,
  DetailValue,
  UnstableCard,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstablePageLoader
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  useExecuteRemediation,
  useGetNhiIdentity,
  useGetRecommendedActions,
  useListRemediationActions,
  useUpdateNhiIdentity
} from "@app/hooks/api/nhi";
import {
  NhiIdentityStatus,
  NhiIdentityType,
  NhiProvider,
  NhiRemediationStatus,
  TNhiRecommendedAction,
  TNhiRiskFactor
} from "@app/hooks/api/nhi/types";

const getSeverityBadgeVariant = (severity: string) => {
  switch (severity) {
    case "critical":
      return "danger" as const;
    case "high":
      return "warning" as const;
    case "medium":
      return "info" as const;
    default:
      return "success" as const;
  }
};

const getStatusBadgeVariant = (status: string) => {
  switch (status) {
    case NhiIdentityStatus.Active:
      return "success" as const;
    case NhiIdentityStatus.Flagged:
      return "warning" as const;
    default:
      return "neutral" as const;
  }
};

const getSeverityIconStyle = (severity: string) => {
  switch (severity) {
    case "critical":
      return "bg-red-500/15 text-red-400";
    case "high":
      return "bg-orange-500/15 text-orange-400";
    case "medium":
      return "bg-yellow-500/15 text-yellow-400";
    default:
      return "bg-green-500/15 text-green-400";
  }
};

const getFactorIcon = (factor: string, severity: string): LucideIcon => {
  const lower = factor.toLowerCase();
  if (lower.includes("admin") || lower.includes("privilege") || lower.includes("permissive"))
    return ShieldAlertIcon;
  if (
    lower.includes("credential") ||
    lower.includes("key") ||
    lower.includes("old") ||
    lower.includes("rotate") ||
    lower.includes("expiration")
  )
    return KeyRoundIcon;
  if (lower.includes("inactive") || lower.includes("unused")) return ClockIcon;
  if (lower.includes("owner")) return UsersIcon;
  switch (severity) {
    case "critical":
      return ShieldAlertIcon;
    case "high":
      return KeyRoundIcon;
    case "medium":
      return ClockIcon;
    default:
      return ArchiveIcon;
  }
};

const formatFactorName = (factor: string) =>
  factor
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());

const formatIdentityType = (type: string) => {
  switch (type) {
    case NhiIdentityType.IamUser:
      return "IAM User";
    case NhiIdentityType.IamRole:
      return "IAM Role";
    case NhiIdentityType.IamAccessKey:
      return "Access Key";
    case NhiIdentityType.GitHubAppInstallation:
      return "GitHub App";
    case NhiIdentityType.GitHubDeployKey:
      return "Deploy Key";
    case NhiIdentityType.GitHubFinegrainedPat:
      return "Fine-grained PAT";
    default:
      return type;
  }
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const extractAccountId = (externalId: string, provider: string) => {
  if (provider === NhiProvider.GitHub) return null;
  // AWS ARN format: arn:aws:iam::ACCOUNT_ID:...
  const parts = externalId.split(":");
  return parts.length >= 5 ? parts[4] : null;
};

const extractAwsAccessDetails = (metadata: Record<string, unknown>) => {
  const details: [string, string][] = [];

  if (typeof metadata.Path === "string") {
    details.push(["Path", metadata.Path]);
  }

  if (typeof metadata.MaxSessionDuration === "number") {
    const seconds = metadata.MaxSessionDuration;
    const hours = Math.floor(seconds / 3600);
    const label =
      hours > 0 ? `${seconds}s (${hours} hour${hours !== 1 ? "s" : ""})` : `${seconds}s`;
    details.push(["Max Session Duration", label]);
  }

  const policyDoc = metadata.AssumeRolePolicyDocument;
  if (policyDoc && typeof policyDoc === "object") {
    const doc = policyDoc as Record<string, unknown>;
    const statements = doc.Statement;
    if (Array.isArray(statements) && statements.length > 0) {
      const first = statements[0] as Record<string, unknown>;
      const principal = first.Principal;
      if (principal && typeof principal === "object") {
        const p = principal as Record<string, unknown>;
        if (typeof p.Service === "string") {
          details.push(["Trust Policy Principal", p.Service]);
        }
      }
      const action = first.Action;
      if (typeof action === "string") {
        details.push(["Trusted Actions", action]);
      } else if (Array.isArray(action)) {
        details.push(["Trusted Actions", action.join(", ")]);
      }
    }
  }

  return details;
};

const extractGitHubAccessDetails = (metadata: Record<string, unknown>, identityType: string) => {
  const details: [string, string][] = [];

  if (identityType === NhiIdentityType.GitHubAppInstallation) {
    const permissions = metadata.permissions as Record<string, string> | undefined;
    if (permissions) {
      details.push([
        "Permissions",
        Object.entries(permissions)
          .map(([k, v]) => `${k}:${v}`)
          .join(", ")
      ]);
    }
    if (typeof metadata.repositorySelection === "string") {
      details.push(["Repository Selection", metadata.repositorySelection]);
    }
    if (metadata.suspendedAt) {
      details.push(["Suspended At", String(metadata.suspendedAt)]);
    }
    if (metadata.events && Array.isArray(metadata.events) && metadata.events.length > 0) {
      details.push(["Subscribed Events", (metadata.events as string[]).join(", ")]);
    }
  }

  if (identityType === NhiIdentityType.GitHubDeployKey) {
    if (typeof metadata.readOnly === "boolean") {
      details.push(["Read Only", metadata.readOnly ? "Yes" : "No"]);
    }
    if (typeof metadata.repoFullName === "string") {
      details.push(["Repository", metadata.repoFullName]);
    }
    if (typeof metadata.verified === "boolean") {
      details.push(["Verified", metadata.verified ? "Yes" : "No"]);
    }
  }

  if (identityType === NhiIdentityType.GitHubFinegrainedPat) {
    const owner = metadata.owner as { login?: string } | undefined;
    if (owner?.login) {
      details.push(["Owner", owner.login]);
    }
    if (typeof metadata.repositorySelection === "string") {
      details.push(["Repository Selection", metadata.repositorySelection]);
    }
    if (typeof metadata.tokenExpired === "boolean") {
      details.push(["Token Status", metadata.tokenExpired ? "Expired" : "Active"]);
    }
    if (metadata.tokenExpiresAt) {
      details.push(["Expires At", new Date(String(metadata.tokenExpiresAt)).toUTCString()]);
    } else {
      details.push(["Expires At", "Never"]);
    }
    if (metadata.tokenLastUsedAt) {
      details.push(["Last Used", new Date(String(metadata.tokenLastUsedAt)).toUTCString()]);
    }
    const permissions = metadata.permissions as
      | { repository?: Record<string, string>; organization?: Record<string, string> }
      | undefined;
    if (permissions) {
      const allPerms = [
        ...Object.entries(permissions.repository || {}).map(([k, v]) => `repo:${k}:${v}`),
        ...Object.entries(permissions.organization || {}).map(([k, v]) => `org:${k}:${v}`)
      ];
      if (allPerms.length > 0) {
        details.push(["Permissions", allPerms.join(", ")]);
      }
    }
  }

  return details;
};

const handleCopy = (text: string) => {
  navigator.clipboard.writeText(text);
  createNotification({ text: "Copied to clipboard", type: "success" });
};

const formatActionType = (actionType: string) =>
  actionType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

export const NhiIdentityDetailPage = () => {
  const { currentProject } = useProject();
  const { nhiIdentityId } = useParams({ strict: false });

  const { data: identity, isPending } = useGetNhiIdentity(
    { identityId: nhiIdentityId as string, projectId: currentProject.id },
    { enabled: Boolean(nhiIdentityId) }
  );

  const { data: recommendedActions } = useGetRecommendedActions(
    { identityId: nhiIdentityId as string, projectId: currentProject.id },
    { enabled: Boolean(nhiIdentityId) }
  );

  const { data: remediationHistory } = useListRemediationActions(
    { identityId: nhiIdentityId as string, projectId: currentProject.id },
    { enabled: Boolean(nhiIdentityId) }
  );

  const updateIdentity = useUpdateNhiIdentity();
  const executeRemediation = useExecuteRemediation();

  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerDirty, setOwnerDirty] = useState(false);
  const [status, setStatus] = useState("");
  const [statusDirty, setStatusDirty] = useState(false);
  const [confirmAction, setConfirmAction] = useState<TNhiRecommendedAction | null>(null);

  if (isPending || !identity) return <UnstablePageLoader />;

  const currentOwner = ownerDirty ? ownerEmail : (identity.ownerEmail ?? "");
  const currentStatus = statusDirty ? status : identity.status;

  const handleSaveOwner = async () => {
    try {
      await updateIdentity.mutateAsync({
        identityId: identity.id,
        projectId: currentProject.id,
        ownerEmail: ownerEmail || null
      });
      setOwnerDirty(false);
      createNotification({ text: "Owner updated", type: "success" });
    } catch {
      createNotification({ text: "Failed to update owner", type: "error" });
    }
  };

  const handleSaveStatus = async () => {
    try {
      await updateIdentity.mutateAsync({
        identityId: identity.id,
        projectId: currentProject.id,
        status
      });
      setStatusDirty(false);
      createNotification({ text: "Status updated", type: "success" });
    } catch {
      createNotification({ text: "Failed to update status", type: "error" });
    }
  };

  const handleRemediate = async (action: TNhiRecommendedAction) => {
    try {
      const result = await executeRemediation.mutateAsync({
        identityId: identity.id,
        projectId: currentProject.id,
        actionType: action.actionType,
        riskFactor: action.riskFactor
      });
      setConfirmAction(null);
      if (result.status === NhiRemediationStatus.Completed) {
        createNotification({ text: `Remediation completed: ${action.label}`, type: "success" });
      } else {
        createNotification({
          text: `Remediation failed: ${result.statusMessage || "Unknown error"}`,
          type: "error"
        });
      }
    } catch {
      setConfirmAction(null);
      createNotification({ text: "Failed to execute remediation", type: "error" });
    }
  };

  const riskFactors: TNhiRiskFactor[] = Array.isArray(identity.riskFactors)
    ? identity.riskFactors
    : [];

  const isGitHub = identity.provider === NhiProvider.GitHub;
  const accountId = extractAccountId(identity.externalId, identity.provider);
  const accessDetails = isGitHub
    ? extractGitHubAccessDetails(identity.metadata, identity.type)
    : extractAwsAccessDetails(identity.metadata);

  return (
    <>
      <Helmet>
        <title>Identity - {identity.name}</title>
      </Helmet>

      <Link
        to="/organizations/$orgId/projects/nhi/$projectId/discovered-identities"
        params={{ orgId: currentProject.orgId, projectId: currentProject.id }}
        className="mb-4 flex w-fit items-center gap-x-1 text-sm text-mineshaft-400 transition duration-100 hover:text-mineshaft-400/80"
      >
        <ChevronLeftIcon size={16} />
        Identities
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-mineshaft-100">{identity.name}</h1>
        <p className="mt-1 text-sm text-mineshaft-400">View identity details</p>
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Left column */}
        <div className="col-span-4 space-y-4">
          <UnstableCard>
            <UnstableCardHeader className="border-b">
              <UnstableCardTitle>Overview</UnstableCardTitle>
              <UnstableCardDescription>Identity overview</UnstableCardDescription>
            </UnstableCardHeader>
            <UnstableCardContent>
              <DetailGroup>
                <Detail>
                  <DetailLabel>Identity</DetailLabel>
                  <DetailValue>{identity.name}</DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Identity Type</DetailLabel>
                  <DetailValue>{formatIdentityType(identity.type)}</DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Status</DetailLabel>
                  <DetailValue>
                    <Badge variant={getStatusBadgeVariant(identity.status)}>
                      {capitalize(identity.status)}
                    </Badge>
                  </DetailValue>
                </Detail>
                {accountId && (
                  <Detail>
                    <DetailLabel>Account ID</DetailLabel>
                    <DetailValue className="flex items-center gap-x-1">
                      <code className="text-sm">{accountId}</code>
                      <button
                        type="button"
                        className="text-mineshaft-400 hover:text-mineshaft-200"
                        onClick={() => handleCopy(accountId)}
                      >
                        <CopyIcon size={12} />
                      </button>
                    </DetailValue>
                  </Detail>
                )}
                <Detail>
                  <DetailLabel>{isGitHub ? "External ID" : "ARN"}</DetailLabel>
                  <DetailValue className="flex items-start gap-x-1">
                    <code className="text-sm break-all">{identity.externalId}</code>
                    <button
                      type="button"
                      className="mt-0.5 shrink-0 text-mineshaft-400 hover:text-mineshaft-200"
                      onClick={() => handleCopy(identity.externalId)}
                    >
                      <CopyIcon size={12} />
                    </button>
                  </DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Created</DetailLabel>
                  <DetailValue>{new Date(identity.createdAt).toUTCString()}</DetailValue>
                </Detail>
              </DetailGroup>
            </UnstableCardContent>
          </UnstableCard>

          <UnstableCard>
            <UnstableCardHeader className="border-b">
              <UnstableCardTitle>Owner</UnstableCardTitle>
              <UnstableCardDescription>Identity owner and assignment</UnstableCardDescription>
            </UnstableCardHeader>
            <UnstableCardContent>
              <DetailGroup>
                <Detail>
                  <DetailLabel>Owner</DetailLabel>
                  <DetailValue>
                    <div className="flex items-center gap-2">
                      <Input
                        value={currentOwner}
                        onChange={(e) => {
                          setOwnerEmail(e.target.value);
                          setOwnerDirty(true);
                        }}
                        placeholder="owner@company.com"
                        className="flex-1"
                      />
                      {ownerDirty && (
                        <Button
                          size="sm"
                          onClick={handleSaveOwner}
                          isPending={updateIdentity.isPending}
                        >
                          <CheckIcon size={14} className="mr-1" />
                          Save
                        </Button>
                      )}
                    </div>
                  </DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Status</DetailLabel>
                  <DetailValue>
                    <div className="flex items-center gap-2">
                      <Select
                        value={currentStatus}
                        onValueChange={(val) => {
                          setStatus(val);
                          setStatusDirty(true);
                        }}
                        className="flex-1"
                      >
                        <SelectItem value={NhiIdentityStatus.Active}>Active</SelectItem>
                        <SelectItem value={NhiIdentityStatus.Inactive}>Inactive</SelectItem>
                        <SelectItem value={NhiIdentityStatus.Flagged}>Flagged</SelectItem>
                      </Select>
                      {statusDirty && (
                        <Button
                          size="sm"
                          onClick={handleSaveStatus}
                          isPending={updateIdentity.isPending}
                        >
                          <CheckIcon size={14} className="mr-1" />
                          Save
                        </Button>
                      )}
                    </div>
                  </DetailValue>
                </Detail>
                <Detail>
                  <DetailLabel>Source</DetailLabel>
                  <DetailValue>
                    <Badge variant="neutral">{identity.provider.toUpperCase()}</Badge>
                  </DetailValue>
                </Detail>
              </DetailGroup>
            </UnstableCardContent>
          </UnstableCard>
        </div>

        {/* Right column */}
        <div className="col-span-8 space-y-4">
          <UnstableCard>
            <UnstableCardHeader className="border-b">
              <UnstableCardTitle>Risk Factors</UnstableCardTitle>
              <UnstableCardDescription>
                Security findings for this identity
                {recommendedActions && recommendedActions.length > 0 && (
                  <span className="text-mineshaft-300">
                    {" "}&mdash; click &quot;Fix&quot; to remediate directly
                  </span>
                )}
              </UnstableCardDescription>
            </UnstableCardHeader>
            <UnstableCardContent>
              {riskFactors.length > 0 ? (
                <div className="divide-y divide-mineshaft-600">
                  {riskFactors.map((factor) => {
                    const FactorIcon = getFactorIcon(factor.factor, factor.severity);
                    const fixAction = recommendedActions?.find(
                      (a) => a.riskFactor === factor.factor
                    );
                    return (
                      <div
                        key={factor.factor}
                        className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                      >
                        <div
                          className={`flex size-9 shrink-0 items-center justify-center rounded-full ${getSeverityIconStyle(factor.severity)}`}
                        >
                          <FactorIcon size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-mineshaft-100">
                            {formatFactorName(factor.factor)}
                          </p>
                          <p className="text-xs text-mineshaft-400">{factor.description}</p>
                        </div>
                        {fixAction && (
                          <Button
                            size="sm"
                            variant="outline_bg"
                            className="shrink-0"
                            onClick={() => setConfirmAction(fixAction)}
                            isPending={
                              executeRemediation.isPending &&
                              confirmAction?.riskFactor === factor.factor
                            }
                          >
                            <ShieldCheckIcon size={14} className="mr-1" />
                            Fix
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-mineshaft-400">No risk factors identified.</p>
              )}
            </UnstableCardContent>
          </UnstableCard>

          {/* Remediation Activity */}
          {remediationHistory && remediationHistory.length > 0 && (
            <UnstableCard>
              <UnstableCardHeader className="border-b">
                <UnstableCardTitle>Remediation Activity</UnstableCardTitle>
                <UnstableCardDescription>Actions that have been applied to this identity</UnstableCardDescription>
              </UnstableCardHeader>
              <UnstableCardContent>
                <div className="space-y-3">
                  {remediationHistory.map((action) => {
                    const isCompleted = action.status === NhiRemediationStatus.Completed;
                    const isFailed = action.status === NhiRemediationStatus.Failed;
                    const isRunning = action.status === NhiRemediationStatus.InProgress;
                    return (
                      <div
                        key={action.id}
                        className={`flex items-start gap-3 rounded-md border p-3 ${
                          isCompleted
                            ? "border-green-500/20 bg-green-500/5"
                            : isFailed
                              ? "border-red-500/20 bg-red-500/5"
                              : "border-mineshaft-600 bg-mineshaft-800"
                        }`}
                      >
                        {isCompleted && <CheckCircle2Icon size={18} className="mt-0.5 shrink-0 text-green-400" />}
                        {isFailed && <XCircleIcon size={18} className="mt-0.5 shrink-0 text-red-400" />}
                        {isRunning && <LoaderIcon size={18} className="mt-0.5 shrink-0 animate-spin text-yellow-400" />}
                        {!isCompleted && !isFailed && !isRunning && (
                          <ClockIcon size={18} className="mt-0.5 shrink-0 text-mineshaft-400" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-mineshaft-100">
                              {formatActionType(action.actionType)}
                            </p>
                            <Badge
                              variant={isCompleted ? "success" : isFailed ? "danger" : "neutral"}
                            >
                              {capitalize(action.status.replace("_", " "))}
                            </Badge>
                          </div>
                          {action.statusMessage && (
                            <p className={`mt-1 text-xs ${isFailed ? "text-red-300" : "text-mineshaft-300"}`}>
                              {action.statusMessage}
                            </p>
                          )}
                          <p className="mt-1 text-xs text-mineshaft-400">
                            {new Date(action.createdAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </UnstableCardContent>
            </UnstableCard>
          )}

          {accessDetails.length > 0 && (
            <UnstableCard>
              <UnstableCardHeader className="border-b">
                <UnstableCardTitle>Access Details</UnstableCardTitle>
                <UnstableCardDescription>
                  {isGitHub
                    ? "Permissions and access configuration"
                    : "Permissions and session configuration"}
                </UnstableCardDescription>
              </UnstableCardHeader>
              <UnstableCardContent>
                <div className="grid grid-cols-2 gap-4">
                  {accessDetails.map(([label, value]) => (
                    <Detail key={label}>
                      <DetailLabel>{label}</DetailLabel>
                      <DetailValue className="font-medium">{value}</DetailValue>
                    </Detail>
                  ))}
                </div>
              </UnstableCardContent>
            </UnstableCard>
          )}

          <UnstableCard>
            <UnstableCardHeader className="border-b">
              <UnstableCardTitle>Raw Metadata</UnstableCardTitle>
              <UnstableCardDescription>Complete identity metadata</UnstableCardDescription>
            </UnstableCardHeader>
            <UnstableCardContent>
              <pre className="max-h-96 overflow-auto rounded bg-mineshaft-800 p-3 text-xs text-mineshaft-200">
                {JSON.stringify(identity.metadata, null, 2)}
              </pre>
            </UnstableCardContent>
          </UnstableCard>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-full max-w-md rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-6 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-red-500/15">
                <ShieldCheckIcon size={20} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-mineshaft-100">{confirmAction.label}</h3>
                <p className="text-sm text-mineshaft-400">{confirmAction.description}</p>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <div className="rounded border border-mineshaft-600 bg-mineshaft-800 p-3">
                <p className="text-xs font-medium uppercase tracking-wider text-mineshaft-400">
                  Target
                </p>
                <p className="mt-1 text-sm text-mineshaft-100">{identity.name}</p>
                <p className="text-xs text-mineshaft-400">{identity.externalId}</p>
              </div>

              <div className="rounded border border-red-500/20 bg-red-500/5 p-3">
                <p className="text-sm text-red-300">
                  This action will be applied directly to {identity.provider === NhiProvider.GitHub ? "GitHub" : "AWS"}.
                  It may not be easily reversible.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button
                variant="outline_bg"
                onClick={() => setConfirmAction(null)}
                disabled={executeRemediation.isPending}
              >
                Cancel
              </Button>
              <Button
                colorSchema="danger"
                onClick={() => handleRemediate(confirmAction)}
                isPending={executeRemediation.isPending}
              >
                Confirm &amp; Apply
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
