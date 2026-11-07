import { useState } from "react";

import guidance from "@app/components/v4/skills/infisical-ui/rules.json";
import { Input } from "@app/components/v4/ui/input";
import { Label } from "@app/components/v4/ui/label";

import {
  DocDisclosure,
  PageHeading,
  RuleMeta,
  useLocationHash,
  useScrollToAnchor
} from "./doc-parts";

export const RulesPage = () => {
  const [query, setQuery] = useState("");
  const hash = useLocationHash();
  const linkedRule = guidance.rules.find((rule) => `#rule-${rule.id}` === hash);
  useScrollToAnchor(linkedRule && `rule-${linkedRule.id}`);
  const visibleRules = guidance.rules.filter((rule) =>
    [rule.id, rule.title, rule.category, rule.instruction]
      .join(" ")
      .toLowerCase()
      .includes(query.trim().toLowerCase())
  );
  return (
    <div>
      <PageHeading title="Rules" />
      <div className="mt-6 space-y-2">
        <Label htmlFor="rule-search">Find a rule</Label>
        <Input
          id="rule-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search copy, forms, motion or data"
        />
        <p className="text-muted-foreground text-xs" role="status">
          {visibleRules.length} of {guidance.rules.length} rules
        </p>
      </div>
      <DocDisclosure title="Protect exact content">
        <p className="text-muted-foreground text-sm leading-6">{guidance.protectedContent}</p>
      </DocDisclosure>
      <div className="mt-8 divide-y divide-border border-y border-border">
        {visibleRules.map((rule) => {
          const linked = rule.id === linkedRule?.id;
          return (
            <DocDisclosure
              key={linked ? `${rule.id}:linked` : rule.id}
              anchor={`rule-${rule.id}`}
              title={rule.title}
              defaultOpen={linked}
              className="py-2"
            >
              <div className="pb-4">
                <p className="text-sm leading-6">{rule.instruction}</p>
                <dl className="mt-4 grid gap-3 text-sm leading-6 sm:grid-cols-2">
                  <div>
                    <dt className="font-medium">Use</dt>
                    <dd className="text-muted-foreground mt-1">{rule.good}</dd>
                  </div>
                  <div>
                    <dt className="font-medium">Avoid</dt>
                    <dd className="text-muted-foreground mt-1">{rule.avoid}</dd>
                  </div>
                </dl>
                <RuleMeta id={rule.id} detect={rule.detect} />
                {"exceptions" in rule && rule.exceptions && (
                  <p className="text-muted-foreground mt-4 text-xs leading-5">
                    Exception boundary. {rule.exceptions}
                  </p>
                )}
                {"source" in rule && rule.source && (
                  <a
                    href={rule.source.url}
                    className="mt-4 inline-block text-xs underline underline-offset-4"
                  >
                    {rule.source.title}
                  </a>
                )}
              </div>
            </DocDisclosure>
          );
        })}
      </div>
    </div>
  );
};
