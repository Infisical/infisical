import { ActionAudit, ResourceAudit, SourceRef } from "./permission-audit.types";
import { formatConditionEntries } from "./permission-audit.utils";

type CsvRow = (string | number | undefined | null)[];

const HEADER: CsvRow = [
  "Resource",
  "Action",
  "Action Description",
  "Access",
  "Source Name",
  "Source Type",
  "Group Name",
  "Temporary",
  "Temporary Expires",
  "Conditions"
];

const ACCESS_LABEL = {
  allow: "Allowed",
  conditional: "Conditional",
  deny: "Denied"
} as const;

const SOURCE_TYPE_LABEL = {
  role: "Direct role",
  group_role: "Group-inherited role",
  additional_privilege: "Additional privilege"
} as const;

const escapeField = (value: string | number | undefined | null): string => {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const toCsv = (rows: CsvRow[]): string =>
  rows.map((row) => row.map(escapeField).join(",")).join("\r\n");

const conditionsToString = (audit: ActionAudit): string =>
  audit.conditions
    .flatMap((c) => formatConditionEntries(c))
    .map((e) => (e.value ? `${e.field} ${e.operator} ${e.value}` : e.field))
    .join("; ");

const rowForSource = (
  resource: ResourceAudit,
  audit: ActionAudit,
  source: SourceRef | undefined
): CsvRow => [
  resource.label,
  audit.label,
  audit.description ?? "",
  ACCESS_LABEL[audit.state],
  source?.name ?? "",
  source ? SOURCE_TYPE_LABEL[source.type] : "",
  source?.groupName ?? "",
  source?.isTemporary ? "Yes" : "",
  source?.temporaryAccessEndTime ?? "",
  conditionsToString(audit)
];

export const buildAuditCsv = (resources: ResourceAudit[]): string => {
  const rows: CsvRow[] = [HEADER];

  resources.forEach((resource) => {
    resource.actions.forEach((audit) => {
      if (audit.grantedBy.length === 0) {
        rows.push(rowForSource(resource, audit, undefined));
        return;
      }
      audit.grantedBy.forEach((source) => {
        rows.push(rowForSource(resource, audit, source));
      });
    });
  });

  return toCsv(rows);
};

const sanitizeForFilename = (value: string): string =>
  value
    .normalize("NFKD")
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "audit";

export const buildAuditCsvFilename = (targetName: string, projectName: string): string => {
  const date = new Date().toISOString().slice(0, 10);
  const target = sanitizeForFilename(targetName);
  const project = sanitizeForFilename(projectName);
  return `permission-audit-${project}-${target}-${date}.csv`;
};

// UTF-8 BOM (U+FEFF) so Excel auto-detects the encoding when opening the file.
const UTF8_BOM = String.fromCharCode(0xfeff);

export const downloadCsv = (filename: string, csv: string): void => {
  const blob = new Blob([`${UTF8_BOM}${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};
