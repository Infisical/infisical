import { useCallback, useEffect, useMemo, useState } from "react";

import { TProjectPermission } from "@app/hooks/api/roles/types";

import {
  canonicalRulesKey,
  formatRulesJson,
  parseRulesJson,
  policyToRules,
  rulesToPolicy,
  TAgentVaultPolicy,
  TUnsupportedRule
} from "./agentVaultPolicyModel";

type TDraftState = {
  savedKey: string;
  baseline: TProjectPermission[];
  rules: TProjectPermission[];
  // What the visual editor shows. It can hold rows the rules leave out, such as a service just added at a level every
  // service already has, so it is kept rather than read back from the rules on every change.
  policy: TAgentVaultPolicy;
  unsupported: TUnsupportedRule[];
  jsonText: string;
  jsonError: string | null;
};

const fromRules = (
  rules: TProjectPermission[],
  baseline: TProjectPermission[],
  savedKey: string
): TDraftState => {
  const { policy, unsupported } = rulesToPolicy(rules);
  return {
    savedKey,
    baseline,
    rules,
    policy,
    unsupported,
    jsonText: formatRulesJson(rules),
    jsonError: null
  };
};

const isDraftDirty = (state: TDraftState) =>
  state.jsonError !== null || canonicalRulesKey(state.rules) !== canonicalRulesKey(state.baseline);

/**
 * The rules being edited, kept in step between the visual editor and the JSON text. The JSON is what gets saved when
 * it was edited last, exactly as written; the visual editor writes the fewest rules that say the same thing.
 */
export const useAgentVaultPolicyDraft = (savedRules: TProjectPermission[]) => {
  const savedKey = JSON.stringify(savedRules);
  const [state, setState] = useState(() => fromRules(savedRules, savedRules, savedKey));

  // New saved rules replace the draft unless it holds changes of its own, which then count against the new rules.
  useEffect(() => {
    setState((prev) => {
      if (prev.savedKey === savedKey) return prev;
      if (!isDraftDirty(prev)) return fromRules(savedRules, savedRules, savedKey);
      return { ...prev, savedKey, baseline: savedRules };
    });
  }, [savedKey]);

  const isDirty = useMemo(() => isDraftDirty(state), [state]);

  const setPolicy = useCallback((policy: TAgentVaultPolicy) => {
    setState((prev) => {
      const rules = policyToRules(policy);
      return {
        ...prev,
        rules,
        policy,
        unsupported: [],
        jsonText: formatRulesJson(rules),
        jsonError: null
      };
    });
  }, []);

  const setJsonText = useCallback((jsonText: string) => {
    setState((prev) => {
      const parsed = parseRulesJson(jsonText);
      if ("error" in parsed) return { ...prev, jsonText, jsonError: parsed.error };
      const { policy, unsupported } = rulesToPolicy(parsed.rules);
      return { ...prev, jsonText, jsonError: null, rules: parsed.rules, policy, unsupported };
    });
  }, []);

  // After a save, start over from what was saved without waiting for the refetch.
  const reset = useCallback((rules?: TProjectPermission[]) => {
    setState((prev) => {
      const next = rules ?? prev.baseline;
      return fromRules(next, next, prev.savedKey);
    });
  }, []);

  return {
    rules: state.rules,
    policy: state.policy,
    unsupported: state.unsupported,
    jsonText: state.jsonText,
    jsonError: state.jsonError,
    isDirty,
    setPolicy,
    setJsonText,
    reset
  };
};

export type TAgentVaultPolicyDraft = ReturnType<typeof useAgentVaultPolicyDraft>;
