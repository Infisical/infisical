import { useState } from "react";
import { EyeOffIcon, KeyIcon, LinkIcon } from "lucide-react";

import {
  Badge,
  Button,
  UnstableAlert,
  UnstableAlertDescription,
  UnstableAlertTitle,
  UnstableTable,
  UnstableTableBody,
  UnstableTableCell,
  UnstableTableHead,
  UnstableTableHeader,
  UnstableTableRow
} from "@app/components/v3";

type Variable = {
  key: string;
  value: string;
  sensitive: boolean;
  source: "workspace" | "infisical";
};

const MOCK_VARIABLES: Variable[] = [
  { key: "AWS_REGION", value: "us-east-1", sensitive: false, source: "workspace" },
  { key: "AWS_ACCESS_KEY_ID", value: "AKIA••••••••••••", sensitive: true, source: "infisical" },
  { key: "AWS_SECRET_ACCESS_KEY", value: "••••••••••••••••", sensitive: true, source: "infisical" },
  { key: "INSTANCE_TYPE", value: "t3.medium", sensitive: false, source: "workspace" },
  { key: "DB_PASSWORD", value: "••••••••••••", sensitive: true, source: "infisical" },
  { key: "ENVIRONMENT", value: "production", sensitive: false, source: "workspace" },
  { key: "DOMAIN_NAME", value: "app.example.com", sensitive: false, source: "workspace" },
  { key: "REPLICA_COUNT", value: "2", sensitive: false, source: "workspace" }
];

export const InfraVariablesPage = () => {
  const [variables] = useState<Variable[]>(MOCK_VARIABLES);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-mineshaft-100">Variables</h1>
          <p className="mt-1 text-sm text-mineshaft-400">
            Variables injected as{" "}
            <code className="rounded bg-mineshaft-700 px-1 py-0.5 text-xs">TF_VAR_*</code>{" "}
            environment variables during runs.
          </p>
        </div>
        <Button variant="outline" size="sm">
          Add Variable
        </Button>
      </div>

      <UnstableTable>
        <UnstableTableHeader>
          <UnstableTableRow>
            <UnstableTableHead>Key</UnstableTableHead>
            <UnstableTableHead>Value</UnstableTableHead>
            <UnstableTableHead>Source</UnstableTableHead>
            <UnstableTableHead>Sensitive</UnstableTableHead>
          </UnstableTableRow>
        </UnstableTableHeader>
        <UnstableTableBody>
          {variables.map((v) => (
            <UnstableTableRow key={v.key}>
              <UnstableTableCell className="font-mono text-xs">
                {v.key}
              </UnstableTableCell>
              <UnstableTableCell className="font-mono text-xs text-mineshaft-400">
                {v.value}
              </UnstableTableCell>
              <UnstableTableCell>
                {v.source === "infisical" ? (
                  <Badge variant="info">
                    <KeyIcon className="size-3" />
                    Infisical Secret
                  </Badge>
                ) : (
                  <Badge variant="neutral">
                    Workspace
                  </Badge>
                )}
              </UnstableTableCell>
              <UnstableTableCell>
                {v.sensitive ? (
                  <Badge variant="warning">
                    <EyeOffIcon className="size-3" />
                    Sensitive
                  </Badge>
                ) : (
                  <span className="text-xs text-mineshaft-600">—</span>
                )}
              </UnstableTableCell>
            </UnstableTableRow>
          ))}
        </UnstableTableBody>
      </UnstableTable>

      <UnstableAlert variant="info">
        <LinkIcon className="size-4" />
        <UnstableAlertTitle>Automatic Variable Sync</UnstableAlertTitle>
        <UnstableAlertDescription>
          Variables from Infisical Secrets are automatically synced at run time. Link a project
          environment to inject secrets as <code className="rounded bg-mineshaft-700 px-1 py-0.5 text-xs">TF_VAR_</code> variables.
        </UnstableAlertDescription>
      </UnstableAlert>
    </div>
  );
};
