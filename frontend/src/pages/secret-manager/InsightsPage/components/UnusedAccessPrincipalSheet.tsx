import { useState } from "react";
import { useParams } from "@tanstack/react-router";
import axios from "axios";

import { GoToSecretButton } from "@app/components/secrets/GoToSecretButton";
import {
  Badge,
  Button,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableRow
} from "@app/components/v3";
import { useProject } from "@app/context";
import {
  TGetUnusedAccessPrincipalResponse,
  TUnusedAccessPrincipal,
  UnusedAccessPrincipalType,
  useGetUnusedAccessPrincipal
} from "@app/hooks/api/secretInsights";

import { describeReadPeriod, PRINCIPAL_TYPE_CONFIG } from "./unusedAccessHelpers";

// Rows shown per environment before "N more" opens the rest.
const PREVIEW_ROWS = 5;

type SecretsProps = {
  data: TGetUnusedAccessPrincipalResponse;
};

const PrincipalSecrets = ({ data }: SecretsProps) => {
  const { currentProject, projectId } = useProject();
  const { orgId } = useParams({ strict: false });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const environmentNames = new Map(currentProject.environments.map((env) => [env.slug, env.name]));
  const byEnvironment = new Map<string, typeof data.secrets>();
  data.secrets.forEach((secret) => {
    byEnvironment.set(secret.environment, [
      ...(byEnvironment.get(secret.environment) ?? []),
      secret
    ]);
  });

  if (data.secrets.length === 0) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Nothing to show</EmptyTitle>
          <EmptyDescription>
            {data.unlistedCount > 0
              ? "The unread secrets are ones you cannot see."
              : "This principal has no unread secrets anymore."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {[...byEnvironment.entries()].map(([environment, secrets]) => {
        const isExpanded = expanded.has(environment);
        const shown = isExpanded ? secrets : secrets.slice(0, PREVIEW_ROWS);
        const hidden = secrets.length - shown.length;
        return (
          <div key={environment} className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              <h3 className="text-sm font-medium">
                {environmentNames.get(environment) ?? environment}
              </h3>
              <span className="text-xs text-muted">{secrets.length} unused</span>
            </div>
            <Table>
              <TableBody>
                {shown.map((secret) => (
                  <TableRow key={`${secret.secretPath}/${secret.secretKey}`}>
                    <TableCell isTruncatable className="max-w-64 font-mono">
                      <span className="truncate">{secret.secretKey}</span>
                    </TableCell>
                    <TableCell isTruncatable className="max-w-48 text-muted">
                      <span className="truncate">{secret.secretPath}</span>
                    </TableCell>
                    <TableCell variant="action">
                      <GoToSecretButton
                        orgId={orgId as string}
                        projectId={projectId}
                        secretKey={secret.secretKey}
                        secretPath={secret.secretPath}
                        environmentSlug={environment}
                        isProjectMember
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {hidden > 0 && (
              <Button
                variant="ghost"
                size="xs"
                className="self-start"
                onClick={() => setExpanded((previous) => new Set(previous).add(environment))}
              >
                {hidden} more
              </Button>
            )}
          </div>
        );
      })}
      {data.unlistedCount > 0 && (
        <p className="text-xs text-muted">
          {data.unlistedCount} more unread {data.unlistedCount === 1 ? "secret is" : "secrets are"}{" "}
          not listed.
        </p>
      )}
    </div>
  );
};

type Props = {
  principal: TUnusedAccessPrincipal | null;
  onClose: () => void;
};

export const UnusedAccessPrincipalSheet = ({ principal, onClose }: Props) => {
  const { projectId } = useProject();
  const { data, isPending, error } = useGetUnusedAccessPrincipal(
    {
      projectId,
      principalType: principal?.principalType ?? UnusedAccessPrincipalType.User,
      principalId: principal?.principalId ?? ""
    },
    { enabled: Boolean(principal) }
  );

  const renderBody = () => {
    if (!principal) return null;
    if (isPending) return <Skeleton className="h-48 w-full" />;
    if (!data) {
      return (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>Could not load unused secrets</EmptyTitle>
            <EmptyDescription>
              {(axios.isAxiosError(error) &&
                (error.response?.data as { message?: string })?.message) ||
                "Try again in a moment."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }
    return (
      <PrincipalSecrets key={`${principal.principalType}-${principal.principalId}`} data={data} />
    );
  };

  const readPeriod = data
    ? describeReadPeriod(data.trackingStartedAt, data.preliminaryUntil)
    : "in the last 30 days";

  return (
    <Sheet
      open={principal !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <SheetContent size="form" side="right" onOpenAutoFocus={(event) => event.preventDefault()}>
        {principal && (
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <span className="truncate">{principal.name}</span>
              <Badge variant="neutral">
                {PRINCIPAL_TYPE_CONFIG[principal.principalType].label}
              </Badge>
            </SheetTitle>
            <SheetDescription>
              Has not read {principal.unreadCount} of the {principal.entitledCount}{" "}
              {principal.entitledCount === 1 ? "secret" : "secrets"} it can access {readPeriod}.
            </SheetDescription>
          </SheetHeader>
        )}
        <div className="flex thin-scrollbar flex-col overflow-y-auto p-4">{renderBody()}</div>
      </SheetContent>
    </Sheet>
  );
};
