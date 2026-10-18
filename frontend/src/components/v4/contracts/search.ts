import type { ComponentDefinition } from "./types";

export const matchesQuery = (text: string, query: string) => {
  const value = text.toLowerCase();
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => value.includes(term));
};

export const searchComponents = (components: readonly ComponentDefinition[], query: string) =>
  components.filter((entry) =>
    matchesQuery(
      [
        entry.id,
        entry.title,
        entry.summary,
        ...entry.referenceNames,
        ...entry.exports,
        ...(entry.coverage ?? []).flatMap((coverage) => [
          coverage.axis,
          ...coverage.expected,
          ...coverage.shown.flatMap((choice) => [choice.value, choice.label, choice.aliasOf ?? ""]),
          ...(coverage.omitted ?? []).flatMap((choice) => [choice.value, choice.reason])
        ]),
        ...entry.behavior,
        ...entry.accessibility,
        ...entry.limitations,
        ...entry.guidance.use,
        ...entry.guidance.avoid,
        entry.guidance.decision,
        ...entry.guidance.rules.flatMap((rule) => [
          rule.id,
          rule.when,
          rule.do,
          rule.avoid,
          rule.reason,
          rule.detect.by,
          rule.detect.by === "lint" ? rule.detect.check : (rule.detect.how ?? "")
        ]),
        ...entry.guidance.states.flatMap((state) => [state.state, state.guidance]),
        ...entry.guidance.antiSlop.flatMap((pair) => [pair.do, pair.avoid, pair.reason])
      ].join(" "),
      query
    )
  );
