import { useState } from "react";

import { createNotification } from "@app/components/notifications";
import { Spinner } from "@app/components/v2";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import {
  useCertManagerLegacyInstances,
  useSetCertManagerActiveProject
} from "@app/hooks/api/certManagerInstance";

export const OrgCertManagerTab = () => {
  const { data, isPending } = useCertManagerLegacyInstances();
  const setActive = useSetCertManagerActiveProject();
  const [pendingId, setPendingId] = useState<string | null>(null);

  const onPick = async (projectId: string, name: string) => {
    setPendingId(projectId);
    try {
      await setActive.mutateAsync(projectId);
      createNotification({
        type: "success",
        text: `${name} is now the active Cert Manager instance`
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Failed to switch active instance.";
      createNotification({ type: "error", text: detail });
    } finally {
      setPendingId(null);
    }
  };

  if (isPending || !data) {
    return (
      <div className="flex items-center justify-center p-8">
        <Spinner />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cert Manager</CardTitle>
        <CardDescription>
          Pick which Cert Manager instance the product launches into. API requests without a
          projectId resolve to the active instance.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {data.instances.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>No Cert Manager instances</EmptyTitle>
              <EmptyDescription>
                Create a Cert Manager project from the organization to get started.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Certificates</TableHead>
                <TableHead className="text-right">Syncs</TableHead>
                <TableHead className="text-right">Alerts</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.instances.map((i) => (
                <TableRow key={i.id}>
                  <TableCell isTruncatable>
                    <div className="font-medium text-foreground">{i.name}</div>
                    <div className="font-mono text-xs text-accent">{i.slug}</div>
                  </TableCell>
                  <TableCell className="text-right">{i.certificateCount}</TableCell>
                  <TableCell className="text-right">{i.syncCount}</TableCell>
                  <TableCell className="text-right">{i.alertCount}</TableCell>
                  <TableCell className="text-right">
                    {i.isActive ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Button
                        size="xs"
                        variant="outline"
                        isPending={pendingId === i.id}
                        onClick={() => onPick(i.id, i.name)}
                      >
                        Set as active
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};
