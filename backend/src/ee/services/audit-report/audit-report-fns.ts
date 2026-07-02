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

// Common acronyms that should stay fully uppercased in humanized headers rather than title-cased.
const HEADER_ACRONYMS: Record<string, string> = { id: "ID", ip: "IP", url: "URL" };

// Turn a camelCase column key into a human-friendly header, e.g. "actorEmail" -> "Actor Email",
// "ipAddress" -> "IP Address". Used only for the displayed header; row values are still keyed by the
// raw column name.
const humanizeColumn = (column: string): string =>
  column
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(" ")
    .map((word) => HEADER_ACRONYMS[word.toLowerCase()] ?? word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

// Serialize a single report into its own standalone CSV — a humanized header row followed by its data rows.
export const serializeReport = ({ columns, rows }: TGeneratedReport): Buffer => {
  const lines = [
    toCsvRow(columns.map(humanizeColumn)),
    ...rows.map((row) => toCsvRow(columns.map((column) => row[column] ?? null)))
  ];
  return Buffer.from(lines.join(CSV_LINE_BREAK), "utf8");
};

export const csvFileNameFromLabel = (label: string): string =>
  `${label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}.csv`;

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
