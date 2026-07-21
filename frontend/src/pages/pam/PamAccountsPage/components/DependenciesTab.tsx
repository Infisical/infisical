import { AlertCircle } from "lucide-react";

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { Skeleton } from "@app/components/v3/generic/Skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@app/components/v3/generic/Tooltip";
import { TPamAccountDependency, useListPamAccountDependencies } from "@app/hooks/api/pam";

const TYPE_LABELS: Record<string, string> = {
  "windows-service": "Windows Service",
  "scheduled-task": "Scheduled Task",
  "iis-app-pool": "IIS App Pool"
};

const StatusBadge = ({ dep }: { dep: TPamAccountDependency }) => {
  if (dep.rotationStatus === "success") return <Badge variant="success">Synced</Badge>;
  if (dep.rotationStatus === "pending") return <Badge variant="neutral">Pending</Badge>;
  if (dep.rotationStatus === "failed") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Badge variant="danger" className="cursor-help gap-1">
                <AlertCircle className="size-3" /> Failed
              </Badge>
            </span>
          </TooltipTrigger>
          {dep.lastRotationMessage && (
            <TooltipContent className="max-w-xs break-words">
              {dep.lastRotationMessage}
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    );
  }
  return <Badge variant="neutral">Not synced</Badge>;
};

export const DependenciesTab = ({ accountId }: { accountId: string }) => {
  const { data: dependencies, isLoading } = useListPamAccountDependencies(accountId);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const deps = dependencies ?? [];
  const machineCount = new Set(deps.map((d) => d.machine)).size;

  return (
    <div className="flex flex-col gap-4 p-4">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-base">
            Dependencies
            <Badge variant="pam">{deps.length}</Badge>
          </CardTitle>
          <CardDescription>
            {deps.length === 0
              ? "Services, scheduled tasks, and IIS app pools that run as this account, detected automatically during discovery."
              : `Rotating this account updates ${deps.length} ${
                  deps.length === 1 ? "dependency" : "dependencies"
                } across ${machineCount} ${machineCount === 1 ? "machine" : "machines"}.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {deps.length === 0 ? (
            <div className="rounded-md border border-border p-8 text-center text-sm text-muted">
              No dependencies detected for this account.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Machine</TableHead>
                  <TableHead>Last Rotation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deps.map((dep) => (
                  <TableRow key={dep.id} className="[&>td]:h-12">
                    <TableCell className="font-medium text-foreground">{dep.name}</TableCell>
                    <TableCell>
                      <Badge variant="neutral">{TYPE_LABELS[dep.type] ?? dep.type}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted">{dep.machine}</TableCell>
                    <TableCell>
                      <StatusBadge dep={dep} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
