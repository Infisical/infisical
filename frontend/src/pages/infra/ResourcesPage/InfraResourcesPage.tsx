import { CheckCircleIcon, CloudIcon } from "lucide-react";

import {
  Badge,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";

const MOCK_RESOURCES = [
  { type: "aws_instance", name: "web-server-1", provider: "aws", status: "running", id: "i-0abc123def456", drift: false },
  { type: "aws_instance", name: "web-server-2", provider: "aws", status: "running", id: "i-0abc123def789", drift: false },
  { type: "aws_instance", name: "api-server", provider: "aws", status: "running", id: "i-0abc123def012", drift: true },
  { type: "aws_instance", name: "worker", provider: "aws", status: "stopped", id: "i-0abc123def345", drift: false },
  { type: "aws_s3_bucket", name: "app-assets", provider: "aws", status: "active", id: "app-assets-prod", drift: false },
  { type: "aws_s3_bucket", name: "logs", provider: "aws", status: "active", id: "infisical-logs", drift: false },
  { type: "aws_s3_bucket", name: "backups", provider: "aws", status: "active", id: "db-backups-prod", drift: true },
  { type: "aws_security_group", name: "web-sg", provider: "aws", status: "active", id: "sg-01234abcde", drift: false },
  { type: "aws_security_group", name: "db-sg", provider: "aws", status: "active", id: "sg-56789fghij", drift: false },
  { type: "aws_security_group", name: "worker-sg", provider: "aws", status: "active", id: "sg-abcde12345", drift: false },
  { type: "aws_vpc", name: "main", provider: "aws", status: "active", id: "vpc-0123456789", drift: false },
  { type: "aws_vpc", name: "staging", provider: "aws", status: "active", id: "vpc-9876543210", drift: false },
  { type: "aws_rds_instance", name: "primary-db", provider: "aws", status: "available", id: "primary-db-prod", drift: false },
  { type: "aws_rds_instance", name: "replica-db", provider: "aws", status: "available", id: "replica-db-prod", drift: false },
  { type: "local_file", name: "config", provider: "local", status: "created", id: "/tmp/config.json", drift: false },
  { type: "local_file", name: "hello", provider: "local", status: "created", id: "/tmp/hello.txt", drift: false },
  { type: "aws_iam_role", name: "app-role", provider: "aws", status: "active", id: "arn:aws:iam::role/app", drift: false },
  { type: "aws_iam_role", name: "deploy-role", provider: "aws", status: "active", id: "arn:aws:iam::role/deploy", drift: false }
];

const statusVariant = (status: string): "success" | "warning" => {
  switch (status) {
    case "running":
    case "active":
    case "available":
    case "created":
      return "success";
    default:
      return "warning";
  }
};

export const InfraResourcesPage = () => {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-mineshaft-100">Resources</h1>
          <p className="mt-1 text-sm text-mineshaft-400">
            {MOCK_RESOURCES.length} resources managed by OpenTofu.
          </p>
        </div>
        <Badge variant="success">
          <CheckCircleIcon className="size-3" />
          State synced
        </Badge>
      </div>

      <UnstableTable>
        <UnstableTableHeader>
          <UnstableTableRow>
            <UnstableTableHead>Type</UnstableTableHead>
            <UnstableTableHead>Name</UnstableTableHead>
            <UnstableTableHead>Provider</UnstableTableHead>
            <UnstableTableHead>Status</UnstableTableHead>
            <UnstableTableHead>Resource ID</UnstableTableHead>
            <UnstableTableHead>Drift</UnstableTableHead>
          </UnstableTableRow>
        </UnstableTableHeader>
        <UnstableTableBody>
          {MOCK_RESOURCES.map((r) => (
            <UnstableTableRow key={`${r.type}-${r.name}`}>
              <UnstableTableCell className="font-mono text-xs text-primary">
                {r.type}
              </UnstableTableCell>
              <UnstableTableCell className="font-medium">
                {r.name}
              </UnstableTableCell>
              <UnstableTableCell>
                <Badge variant="neutral">
                  <CloudIcon className="size-3" />
                  {r.provider}
                </Badge>
              </UnstableTableCell>
              <UnstableTableCell>
                <Badge variant={statusVariant(r.status)}>
                  {r.status}
                </Badge>
              </UnstableTableCell>
              <UnstableTableCell className="max-w-[200px] font-mono text-xs text-mineshaft-400" isTruncatable>
                {r.id}
              </UnstableTableCell>
              <UnstableTableCell>
                {r.drift ? (
                  <Badge variant="warning">drift</Badge>
                ) : (
                  <span className="text-xs text-mineshaft-600">—</span>
                )}
              </UnstableTableCell>
            </UnstableTableRow>
          ))}
        </UnstableTableBody>
      </UnstableTable>
    </div>
  );
};
