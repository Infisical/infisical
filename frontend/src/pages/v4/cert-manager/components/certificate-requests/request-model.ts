import { useState } from "react";

import {
  buildPolicyRules,
  evaluateCustomExtensions,
  evaluateSubjectStep,
  getValidityHint,
  type TCustomExtensionDeclaration,
  validateTtlAgainstPolicy
} from "@app/helpers/certificatePolicyGuidance";
import type { SubjectAltName, SubjectAttribute } from "@app/helpers/certificateUtils";
import type { TCertificatePolicy } from "@app/hooks/api/certificatePolicies/types";

import { ruleKey } from "../policy-model";

export type Keyed<T> = T & { key: string };
export type SubjectRow = Keyed<SubjectAttribute>;
export type SanRow = Keyed<SubjectAltName>;
export type ExtensionRow = Keyed<{ oid: string; value: string; critical?: boolean }>;

export type RequestErrors = Partial<Record<string, string>>;

export const keyed = <T extends object>(rows: (T & { key?: string })[]): Keyed<T>[] =>
  rows.map((row) => (row.key ? (row as Keyed<T>) : { ...row, key: ruleKey() }));

export const POLICY_FIELDS = [
  "subjectAttributes",
  "subjectAltNames",
  "ttl",
  "customExtensions"
] as const;

export type PolicyField = (typeof POLICY_FIELDS)[number];

const NO_DECLARATIONS: TCustomExtensionDeclaration[] = [];

type Revealed = { resetKey?: string; fields: ReadonlySet<PolicyField> };

export const usePolicyGuidance = ({
  policy,
  subjectAttributes,
  subjectAltNames,
  ttl,
  customExtensions,
  customExtensionDeclarations = NO_DECLARATIONS,
  isSubjectSectionShown,
  isSanSectionShown,
  isSubjectEvaluated = true,
  isValidityEvaluated = true,
  resetKey
}: {
  policy?: TCertificatePolicy | null;
  subjectAttributes: SubjectAttribute[];
  subjectAltNames: SubjectAltName[];
  ttl: string;
  customExtensions: { oid: string; value: string }[];
  customExtensionDeclarations?: TCustomExtensionDeclaration[];
  isSubjectSectionShown: boolean;
  isSanSectionShown: boolean;
  isSubjectEvaluated?: boolean;
  isValidityEvaluated?: boolean;
  resetKey?: string;
}) => {
  const [revealed, setRevealed] = useState<Revealed>({ resetKey, fields: new Set() });
  const fields = revealed.resetKey === resetKey ? revealed.fields : new Set<PolicyField>();

  const { subject, sans } = evaluateSubjectStep({
    rules: buildPolicyRules(isSubjectEvaluated ? policy : undefined),
    subjectAttributes,
    subjectAltNames,
    isSubjectSectionShown,
    isSanSectionShown
  });
  const extensions = evaluateCustomExtensions({
    declarations: customExtensionDeclarations,
    rows: customExtensions,
    rules: policy?.customExtensions
  });
  const maxTtl = policy?.validity?.max;
  const ttlHint = isValidityEvaluated ? getValidityHint(maxTtl) : undefined;
  const ttlError = isValidityEvaluated ? validateTtlAgainstPolicy(ttl, maxTtl) : undefined;

  const blocked = new Set<PolicyField>([
    ...(subject.isBlocking ? (["subjectAttributes"] as const) : []),
    ...(sans.isBlocking ? (["subjectAltNames"] as const) : []),
    ...(ttlError ? (["ttl"] as const) : []),
    ...(extensions.isBlocking ? (["customExtensions"] as const) : [])
  ]);

  const update = (change: (next: Set<PolicyField>) => void) =>
    setRevealed((previous) => {
      const next = new Set(previous.resetKey === resetKey ? previous.fields : []);
      change(next);
      return { resetKey, fields: next };
    });

  return {
    subject,
    sans,
    customExtensions: extensions,
    ttlHint,
    ttlError,
    isRevealed: (field: PolicyField) => fields.has(field),
    reveal: (names: readonly string[]) =>
      update((next) => {
        const wanted = new Set(names);
        POLICY_FIELDS.filter((field) => wanted.has(field)).forEach((field) => next.add(field));
      }),
    hide: (names: readonly PolicyField[]) =>
      update((next) => names.forEach((field) => next.delete(field))),
    findBlockedFields: (names: readonly string[]) =>
      POLICY_FIELDS.filter((field) => names.includes(field) && blocked.has(field))
  };
};

export type PolicyGuidance = ReturnType<typeof usePolicyGuidance>;
