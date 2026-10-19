import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

import { componentCatalog } from "../src/components/v4/catalog";
import { matchesQuery, searchComponents } from "../src/components/v4/contracts/search";

const ruleCatalog = z
  .object({
    protectedContent: z.string(),
    rules: z.array(
      z
        .object({
          id: z.string(),
          title: z.string(),
          category: z.string(),
          instruction: z.string(),
          good: z.string(),
          avoid: z.string(),
          detect: z.object({ by: z.enum(["lint", "test", "review"]) }).passthrough()
        })
        .passthrough()
    )
  })
  .parse(
    JSON.parse(
      readFileSync(
        path.resolve(import.meta.dirname, "../src/components/v4/skills/infisical-ui/rules.json"),
        "utf8"
      )
    )
  );
const cliArgs = process.argv.slice(2);
if (cliArgs.some((value) => value === "--help" || value === "-h")) {
  process.stdout.write(`Usage: npm run ui:info -- [task words | component id | rule:id]

Search names, exports, behavior, accessibility, limits, guidance and declared example coverage. Every query word must match.

Examples:
  npm run ui:info -- nullable DELETE
  npm run ui:info -- breadcrumb
  npm run ui:info -- rule:working-affordances
  npm run ui:info -- rule:data-grid-usage

No query returns the complete catalog. Checks are commands to run, not passing evidence.
`);
  process.exit(0);
}
const query = cliArgs.join(" ").toLowerCase();
const rulesOnly = query.startsWith("rule:");
const term = rulesOnly ? query.slice(5) : query;
const matches = rulesOnly ? [] : searchComponents(componentCatalog, term);
const rules = ruleCatalog.rules.filter((rule) =>
  matchesQuery(
    [rule.id, rule.title, rule.category, rule.instruction, rule.good, rule.avoid].join(" "),
    term
  )
);
const componentRules = componentCatalog.flatMap((component) =>
  component.guidance.rules
    .filter((rule) =>
      matchesQuery(
        [
          component.id,
          component.title,
          rule.id,
          rule.when,
          rule.do,
          rule.avoid,
          rule.reason,
          rule.detect.by,
          rule.detect.by === "lint" ? rule.detect.check : (rule.detect.how ?? "")
        ].join(" "),
        term
      )
    )
    .map((rule) => ({ componentId: component.id, componentTitle: component.title, ...rule }))
);
process.stdout.write(
  `${JSON.stringify({ scope: "Incubating foundation. A rule's detect field says whether lint, a test or only review catches it.", protectedContent: ruleCatalog.protectedContent, components: matches, rules, componentRules }, null, 2)}\n`
);
if (query && !matches.length && !rules.length && !componentRules.length) process.exitCode = 1;
