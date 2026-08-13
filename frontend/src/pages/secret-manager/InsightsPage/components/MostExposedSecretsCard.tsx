import { useState } from "react";
import { useParams } from "@tanstack/react-router";
import { NetworkIcon } from "lucide-react";

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import {
  ExposureBand,
  TExposureRankingEntry,
  useGetSecretExposureRanking
} from "@app/hooks/api/blastRadius";
import { BlastRadiusSheet } from "@app/pages/secret-manager/BlastRadiusPage/components/BlastRadiusSheet";

const BAND_VARIANT: Record<ExposureBand, "success" | "info" | "warning" | "danger" | "neutral"> = {
  [ExposureBand.Low]: "success",
  [ExposureBand.Elevated]: "info",
  [ExposureBand.High]: "warning",
  [ExposureBand.Critical]: "danger",
  [ExposureBand.Unavailable]: "neutral"
};

type Props = {
  projectId: string;
};

export const MostExposedSecretsCard = ({ projectId }: Props) => {
  const { orgId } = useParams({ from: ROUTE_PATHS.SecretManager.InsightsPage.id });
  const { data: rankings, isPending } = useGetSecretExposureRanking({ projectId, limit: 5 });
  // Rows open the same drawer the secrets list uses rather than navigating away: the ranking is a
  // starting point, and you usually want to look at two or three of them in a row.
  const [openSecret, setOpenSecret] = useState<TExposureRankingEntry | undefined>();

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            <NetworkIcon size={14} className="text-secret" />
            Most Exposed Secrets
          </CardTitle>
          <CardDescription>
            Ranked by who can read them, where their value has been distributed, and how long it has
            been unchanged. Rows open the blast radius view.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isPending && (
            <div className="flex flex-col gap-2 p-4">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </div>
          )}

          {!isPending && !rankings?.length && (
            <Empty className="py-8">
              <EmptyHeader>
                <EmptyTitle>Nothing ranked yet</EmptyTitle>
                <EmptyDescription>
                  Secrets appear here once they have consumers or destinations to measure.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {!isPending && Boolean(rankings?.length) && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Secret</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>No reads</TableHead>
                  <TableHead>Destinations</TableHead>
                  <TableHead>Ghosts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rankings?.map((entry, index) => (
                  <TableRow
                    key={entry.secretId}
                    className="cursor-pointer"
                    onClick={() => setOpenSecret(entry)}
                  >
                    <TableCell className="font-mono text-xs text-muted">{index + 1}</TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-mono text-xs text-foreground">{entry.secretKey}</span>
                        <span className="text-xs text-muted">
                          {entry.environmentName} · {entry.secretPath}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={BAND_VARIANT[entry.band]} className="font-mono text-xs">
                        {entry.score ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-accent">
                      {entry.noReadsCount} of {entry.entitledCount}
                    </TableCell>
                    <TableCell className="text-xs text-accent">{entry.destinationCount}</TableCell>
                    <TableCell className="text-xs text-accent">
                      {entry.ghostReaderCount ? (
                        <span className="text-warning">{entry.ghostReaderCount}</span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {openSecret && (
        <BlastRadiusSheet
          isOpen
          onOpenChange={(isOpen) => !isOpen && setOpenSecret(undefined)}
          projectId={projectId}
          orgId={orgId}
          secretKey={openSecret.secretKey}
          environment={openSecret.environment}
          secretPath={openSecret.secretPath}
        />
      )}
    </>
  );
};
