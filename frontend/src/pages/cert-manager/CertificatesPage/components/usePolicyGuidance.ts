import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UseFormClearErrors, UseFormWatch } from "react-hook-form";

import { TCertificatePolicy } from "@app/hooks/api/certificatePolicies";

import {
  buildPolicyRules,
  evaluateSubjectStep,
  getValidityHint,
  PolicySectionGuidance,
  validateTtlAgainstPolicy
} from "./certificatePolicyGuidance";
import { SubjectAltName, SubjectAttribute } from "./certificateUtils";

/** The form fields this hook evaluates. Each wizard step declares the ones it owns. */
export const POLICY_FIELDS = ["subjectAttributes", "subjectAltNames", "ttl"] as const;

export type PolicyField = (typeof POLICY_FIELDS)[number];

const SUBJECT_FIELDS: PolicyField[] = ["subjectAttributes", "subjectAltNames"];

const EMPTY_SUBJECT_ATTRIBUTES: SubjectAttribute[] = [];
const EMPTY_SUBJECT_ALT_NAMES: SubjectAltName[] = [];

type UsePolicyGuidanceParams = {
  policy?: TCertificatePolicy | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  watch: UseFormWatch<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clearErrors: UseFormClearErrors<any>;
  isSubjectSectionShown: boolean;
  isSanSectionShown: boolean;
  /** False for request methods that take the subject from a CSR instead of these fields. */
  isSubjectEvaluated?: boolean;
  /** False when an external CA's template owns validity, so the TTL field is not shown. */
  isValidityEvaluated?: boolean;
  /** Identity of the current policy source; a change here starts every violation hidden again. */
  resetKey?: string;
};

export type PolicyGuidance = {
  subject: PolicySectionGuidance;
  sans: PolicySectionGuidance;
  ttlHint?: string[];
  ttlError?: string;
  /** True once the requester has tried to leave the step that owns this field. */
  isRevealed: (field: PolicyField) => boolean;
  /** Called when leaving a step, so its own violations surface where they can be fixed. */
  reveal: (fields: readonly string[]) => void;
  /** Which of `fields` must be fixed before the request can go any further. */
  findBlockedFields: (fields: readonly string[]) => PolicyField[];
};

/**
 * Evaluates the profile's policy against the form on every keystroke, and owns when those findings
 * are allowed to surface: a field stays quiet until the requester tries to leave the step that owns
 * it, and goes quiet again the moment they edit it. Violations therefore never interrupt typing,
 * and the request can still never reach issuance carrying one.
 */
export const usePolicyGuidance = ({
  policy,
  watch,
  clearErrors,
  isSubjectSectionShown,
  isSanSectionShown,
  isSubjectEvaluated = true,
  isValidityEvaluated = true,
  resetKey
}: UsePolicyGuidanceParams): PolicyGuidance => {
  const subjectAttributes: SubjectAttribute[] =
    watch("subjectAttributes") ?? EMPTY_SUBJECT_ATTRIBUTES;
  const subjectAltNames: SubjectAltName[] = watch("subjectAltNames") ?? EMPTY_SUBJECT_ALT_NAMES;
  const ttl: string = watch("ttl") ?? "";

  const rules = useMemo(
    () => buildPolicyRules(isSubjectEvaluated ? policy : undefined),
    [policy, isSubjectEvaluated]
  );

  const { subject, sans } = useMemo(
    () =>
      evaluateSubjectStep({
        rules,
        subjectAttributes,
        subjectAltNames,
        isSubjectSectionShown,
        isSanSectionShown
      }),
    [rules, subjectAttributes, subjectAltNames, isSubjectSectionShown, isSanSectionShown]
  );

  const maxTtl = policy?.validity?.max;
  const ttlHint = useMemo(
    () => (isValidityEvaluated ? getValidityHint(maxTtl) : undefined),
    [maxTtl, isValidityEvaluated]
  );
  const ttlError = useMemo(
    () => (isValidityEvaluated ? validateTtlAgainstPolicy(ttl, maxTtl) : undefined),
    [ttl, maxTtl, isValidityEvaluated]
  );

  const [revealedFields, setRevealedFields] = useState<ReadonlySet<PolicyField>>(new Set());

  const hide = useCallback((fields: readonly PolicyField[]) => {
    setRevealedFields((previous) => {
      if (!fields.some((field) => previous.has(field))) return previous;
      const next = new Set(previous);
      fields.forEach((field) => next.delete(field));
      return next;
    });
  }, []);

  const reveal = useCallback((fields: readonly string[]) => {
    const revealable = POLICY_FIELDS.filter((field) => fields.includes(field));
    if (revealable.length === 0) return;
    setRevealedFields((previous) => new Set([...previous, ...revealable]));
  }, []);

  // A different policy makes every finding from the previous one meaningless.
  useEffect(() => setRevealedFields(new Set()), [resetKey]);

  // Editing a field puts its findings away until the next attempt to leave the step. React Hook
  // Form's own errors are cleared alongside them, so both sources surface on the same terms.
  useEffect(() => {
    hide(SUBJECT_FIELDS);
    clearErrors(SUBJECT_FIELDS);
  }, [subjectAttributes, subjectAltNames, clearErrors, hide]);

  useEffect(() => {
    hide(["ttl"]);
    clearErrors("ttl");
  }, [ttl, clearErrors, hide]);

  // Read through a ref so the wizard's validateStep callback does not have to be rebuilt per render.
  const blockedFields = useRef<ReadonlySet<PolicyField>>(new Set());
  blockedFields.current = new Set<PolicyField>([
    ...(subject.isBlocking ? (["subjectAttributes"] as const) : []),
    ...(sans.isBlocking ? (["subjectAltNames"] as const) : []),
    ...(ttlError ? (["ttl"] as const) : [])
  ]);

  const findBlockedFields = useCallback(
    (fields: readonly string[]) =>
      POLICY_FIELDS.filter((field) => fields.includes(field) && blockedFields.current.has(field)),
    []
  );

  const isRevealed = useCallback(
    (field: PolicyField) => revealedFields.has(field),
    [revealedFields]
  );

  return { subject, sans, ttlHint, ttlError, isRevealed, reveal, findBlockedFields };
};
