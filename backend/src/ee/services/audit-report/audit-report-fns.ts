import { z } from "zod";

import { TAuditReports } from "@app/db/schemas";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import {
  CONSTRAINT_LABELS,
  evaluateConstraint,
  TStaticSecretConstraintViolation
} from "@app/services/secret-validation-rule/secret-validation-rule-fns";
import { TConstraint } from "@app/services/secret-validation-rule/secret-validation-rule-types";

import {
  AuditReportResultEntrySchema,
  AuditReportStatus,
  AuditReportType,
  MAX_AUDIT_REPORT_ROWS,
  TGeneratedReport,
  TSecretToValidate
} from "./audit-report-types";

export const DAY_IN_MS = 24 * 60 * 60 * 1000;

export const daysSince = (date: Date): number => Math.max(0, Math.floor((Date.now() - date.getTime()) / DAY_IN_MS));

const CSV_LINE_BREAK = "\r\n";

const CSV_FORMULA_TRIGGERS = ["=", "+", "-", "@", "\t", "\r"];

const escapeCsvCell = (value: string | number | null): string => {
  if (value === null) return "";
  let str = String(value);
  if (str.length > 0 && CSV_FORMULA_TRIGGERS.includes(str[0])) {
    str = `'${str}`;
  }
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

const toCsvRow = (cells: (string | number | null)[]): string => cells.map(escapeCsvCell).join(",");

export type TAuditReportSection = {
  title: string;
  report: TGeneratedReport;
};

export const serializeReportBundle = ({
  projectName,
  generatedAt,
  sections
}: {
  projectName: string;
  generatedAt: Date;
  sections: TAuditReportSection[];
}): Buffer => {
  const lines: string[] = [
    toCsvRow(["Infisical Audit Report"]),
    toCsvRow(["Project", projectName]),
    toCsvRow(["Generated At", generatedAt.toISOString()])
  ];

  sections.forEach(({ title, report }) => {
    lines.push("");
    // The section title occupies the first column; the report's own column headers sit on the SAME row,
    // shifted one column to the right. Data/notes are indented by one empty leading column so they line up
    // beneath those headers when opened in a spreadsheet (the title column acts as a left-margin label).
    lines.push(toCsvRow([title.toUpperCase(), ...report.columns]));
    if (report.rows.length === 0) {
      lines.push(toCsvRow(["", "No matching records"]));
    } else {
      report.rows.forEach((row) => {
        lines.push(toCsvRow(["", ...report.columns.map((column) => row[column] ?? null)]));
      });
    }
    if (report.truncated) {
      lines.push(toCsvRow(["", `Note: results truncated at ${MAX_AUDIT_REPORT_ROWS.toLocaleString()} rows`]));
    }
  });

  return Buffer.from(lines.join(CSV_LINE_BREAK), "utf8");
};

// Resolve folder ids to their human-readable secret paths in a single batched query.
export const buildFolderPathMap = async (
  folderDAL: Pick<TSecretFolderDALFactory, "findSecretPathByFolderIds">,
  projectId: string,
  folderIds: string[]
): Promise<Record<string, string>> => {
  const uniqueIds = [...new Set(folderIds)];
  if (!uniqueIds.length) return {};

  const folders = await folderDAL.findSecretPathByFolderIds(projectId, uniqueIds);
  const pathByFolderId: Record<string, string> = {};
  folders.forEach((folder) => {
    if (folder) pathByFolderId[folder.id] = folder.path;
  });
  return pathByFolderId;
};

const StoredReportConfigsSchema = z.array(
  z.object({
    type: z.nativeEnum(AuditReportType),
    inputs: z.record(z.unknown())
  })
);

export const presentAuditReport = (report: TAuditReports) => ({
  id: report.id,
  projectId: report.projectId,
  requestedByUserId: report.requestedByUserId ?? null,
  status: z.nativeEnum(AuditReportStatus).parse(report.status),
  reportConfigs: StoredReportConfigsSchema.parse(report.reportConfigs),
  emailRecipients: report.emailRecipients,
  resultSummary:
    report.resultSummary == null ? null : z.array(AuditReportResultEntrySchema).parse(report.resultSummary),
  errorMessage: report.errorMessage ?? null,
  createdAt: report.createdAt,
  updatedAt: report.updatedAt
});

export type TPresentedAuditReport = ReturnType<typeof presentAuditReport>;

export const evaluateStaticSecretConstraints = (
  constraints: TConstraint[],
  secret: TSecretToValidate
): TStaticSecretConstraintViolation[] => {
  const violations: TStaticSecretConstraintViolation[] = [];
  for (const constraint of constraints) {
    const error = evaluateConstraint(constraint, secret);
    if (error) {
      violations.push({
        constraintType: constraint.type,
        constraintLabel: CONSTRAINT_LABELS[constraint.type],
        message: error
      });
    }
  }
  return violations;
};
