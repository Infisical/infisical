import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@app/components/v3";
import { TBlastRadius, TBlastRadiusPrincipal } from "@app/hooks/api/blastRadius";

import {
  describeObserved,
  DESTINATION_STATUS_LABEL,
  DESTINATION_STATUS_VARIANT,
  formatReadCount,
  PRECISION_LABEL,
  relativeTime,
  strongestActionLabel
} from "../utils/format";

type Props = {
  blastRadius: TBlastRadius;
  onSelectPrincipal: (principal: TBlastRadiusPrincipal) => void;
};

const viaLabel = (principal: TBlastRadiusPrincipal) => {
  if (!principal.grantPaths.length) return "unresolved";

  const labels = principal.grantPaths.map((path) => {
    const group = path.via.find((step) => step.kind === "group");
    if (group && group.kind === "group") return `group ${group.groupName}`;
    const privilege = path.via.find((step) => step.kind === "additionalPrivilege");
    if (privilege && privilege.kind === "additionalPrivilege") return `privilege ${privilege.name}`;
    const role = path.via.find((step) => step.kind === "role");
    return role && role.kind === "role" ? `role ${role.roleSlug ?? role.roleName}` : "direct";
  });

  return [...new Set(labels)].join(" + ");
};

export const BlastRadiusTable = ({ blastRadius, onSelectPrincipal }: Props) => {
  const { principals, destinations, ghostReaders, window } = blastRadius;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Access · {blastRadius.truncated.principals.total} principals</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Principal</TableHead>
                <TableHead>Via</TableHead>
                <TableHead>Permission</TableHead>
                <TableHead>Reads · {window.effectiveDays}d</TableHead>
                <TableHead>Precision</TableHead>
                <TableHead>Clients</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {principals.map((principal) => (
                <TableRow
                  key={`${principal.type}-${principal.id}`}
                  onClick={() => onSelectPrincipal(principal)}
                  className="cursor-pointer"
                >
                  <TableCell className="truncate">
                    {principal.name}
                    {principal.type === "group" && (
                      <span className="text-muted"> · {principal.memberCount ?? 0}</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-accent">
                    {viaLabel(principal)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        strongestActionLabel(principal.actions) === "Read Value"
                          ? "danger"
                          : "neutral"
                      }
                      className=""
                    >
                      {strongestActionLabel(principal.actions)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-accent">
                    {describeObserved(
                      principal.observed,
                      window.effectiveDays,
                      window.consumptionAvailable
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-accent">
                    {principal.observed?.precision
                      ? PRECISION_LABEL[principal.observed.precision]
                      : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-accent">
                    {principal.observed?.clients.join(", ") || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {Boolean(ghostReaders.length) && (
        <Card>
          <CardHeader>
            <CardTitle>Ghost readers · {ghostReaders.length}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Actor</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Reads</TableHead>
                  <TableHead>Last read</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ghostReaders.map((ghost) => (
                  <TableRow key={`${ghost.actorId}-${ghost.lastReadAt}`}>
                    <TableCell className="truncate">{ghost.label}</TableCell>
                    <TableCell>
                      <Badge variant="warning">
                        {ghost.principalExists ? "Access revoked" : "Deleted"}
                      </Badge>
                    </TableCell>
                    {/* This table has no precision column for ghosts, so the `~` is the only thing
                        saying the count came from a bulk read and is not per-key. */}
                    <TableCell className="text-xs text-accent">
                      {formatReadCount(ghost.readCount, ghost.precision)}
                    </TableCell>
                    <TableCell className="text-xs text-accent">
                      {relativeTime(ghost.lastReadAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Destinations · {destinations.length}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Destination</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {destinations.map((destination) => (
                <TableRow key={destination.id}>
                  <TableCell className="truncate">{destination.label}</TableCell>
                  <TableCell className="font-mono text-xs text-accent">
                    {destination.target ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs text-accent">{destination.kind}</TableCell>
                  <TableCell>
                    <Badge variant={DESTINATION_STATUS_VARIANT[destination.status]} className="">
                      {destination.autoSync === false
                        ? "auto-sync off"
                        : DESTINATION_STATUS_LABEL[destination.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
