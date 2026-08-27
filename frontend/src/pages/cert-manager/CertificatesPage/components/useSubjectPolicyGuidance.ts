import { useCallback, useMemo, useRef } from "react";
import { UseFormSetValue, UseFormWatch } from "react-hook-form";

import { TCertificatePolicy } from "@app/hooks/api/certificatePolicies";

import {
  buildPolicyRules,
  evaluateSubjectStep,
  SubjectPolicyGuidance
} from "./certificatePolicyGuidance";
import { SubjectAltName, SubjectAttribute } from "./certificateUtils";

const EMPTY_SUBJECT_ATTRIBUTES: SubjectAttribute[] = [];
const EMPTY_SUBJECT_ALT_NAMES: SubjectAltName[] = [];

type UseSubjectPolicyGuidanceParams = {
  policy?: TCertificatePolicy | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  watch: UseFormWatch<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue: UseFormSetValue<any>;
  isSubjectSectionShown: boolean;
  isSanSectionShown: boolean;
  isEnabled?: boolean;
};

/**
 * Evaluates the subject step against the profile's policy on every keystroke so the constraints and
 * their violations surface where they can be fixed, rather than as a rejection at issuance.
 */
export const useSubjectPolicyGuidance = ({
  policy,
  watch,
  setValue,
  isSubjectSectionShown,
  isSanSectionShown,
  isEnabled = true
}: UseSubjectPolicyGuidanceParams): SubjectPolicyGuidance & { addMissingFields: () => void } => {
  const subjectAttributes: SubjectAttribute[] =
    watch("subjectAttributes") ?? EMPTY_SUBJECT_ATTRIBUTES;
  const subjectAltNames: SubjectAltName[] = watch("subjectAltNames") ?? EMPTY_SUBJECT_ALT_NAMES;

  const rules = useMemo(
    () => buildPolicyRules(isEnabled ? policy : undefined),
    [policy, isEnabled]
  );

  const guidance = useMemo(
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

  const requirementsRef = useRef(guidance.requirements);
  requirementsRef.current = guidance.requirements;

  const addMissingFields = useCallback(() => {
    const additions = requirementsRef.current
      .map(({ addRows }) => addRows)
      .filter((addRows): addRows is NonNullable<typeof addRows> => Boolean(addRows));

    const subjectRows = additions.flatMap((addition) =>
      addition.kind === "subject"
        ? addition.values.map((value) => ({ type: addition.type, value }))
        : []
    );
    const sanRows = additions.flatMap((addition) =>
      addition.kind === "san"
        ? addition.values.map((value) => ({ type: addition.type, value }))
        : []
    );

    if (subjectRows.length > 0) {
      setValue("subjectAttributes", [...subjectAttributes, ...subjectRows], { shouldDirty: true });
    }
    if (sanRows.length > 0) {
      setValue("subjectAltNames", [...subjectAltNames, ...sanRows], { shouldDirty: true });
    }
  }, [setValue, subjectAttributes, subjectAltNames]);

  return { ...guidance, addMissingFields };
};
