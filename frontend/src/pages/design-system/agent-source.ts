import instructions from "@app/components/v4/AGENTS.md?raw";
import { componentCatalog } from "@app/components/v4/catalog";
import rules from "@app/components/v4/skills/infisical-ui/rules.json";
import skill from "@app/components/v4/skills/infisical-ui/SKILL.md?raw";
import tokens from "@app/components/v4/tokens.json";

import { documentationPages } from "./navigation";

const guides = import.meta.glob<string>("../../components/v4/docs/*.md", {
  query: "?raw",
  import: "default"
});

export interface AgentDocument {
  source: string;
  markdown: string;
  exact: boolean;
}

const jsonBlock = (value: unknown) => `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
const selectedRules = (categories: string[]) => ({
  scope: rules.scope,
  protectedContent: rules.protectedContent,
  verificationNote: rules.verificationNote,
  rules: rules.rules.filter((rule) => categories.includes(rule.category))
});

export const loadAgentDocument = async (page: string): Promise<AgentDocument> => {
  if (componentCatalog.some((entry) => entry.id === page)) {
    const loader = guides[`../../components/v4/docs/${page}.md`];
    if (!loader) throw new Error("The generated component guide is missing.");
    return {
      source: `src/components/v4/docs/${page}.md`,
      markdown: await loader(),
      exact: true
    };
  }
  const title = documentationPages.find((entry) => entry.id === page)?.title ?? page;
  switch (page) {
    case "overview": {
      const index = guides["../../components/v4/docs/README.md"];
      if (!index) throw new Error("The generated guide index is missing.");
      return {
        source: "src/components/v4/AGENTS.md + docs/README.md",
        markdown: `${instructions}\n\n${await index()}`,
        exact: false
      };
    }
    case "rules":
      return {
        source: "src/components/v4/skills/infisical-ui/SKILL.md + rules.json",
        markdown: `${skill}\n\n## Canonical rules\n\n${jsonBlock(rules)}\n`,
        exact: false
      };
    default: {
      const sections = {
        colors: { color: tokens.color },
        typography: { type: tokens.type },
        "spacing-shape": {
          spacing: tokens.spacing,
          size: tokens.size,
          radius: tokens.radius,
          shape: tokens.shape
        },
        motion: selectedRules(["Interaction", "Accessibility"])
      };
      const section = Object.entries(sections).find(([id]) => id === page)?.[1];
      if (!section) throw new Error("This destination has no agent document.");
      let source = "src/components/v4/tokens.json";
      if (page === "motion") source = "src/components/v4/skills/infisical-ui/rules.json";
      return {
        source,
        markdown: `# ${title}\n\nThis Markdown wraps the canonical source records below. Verification labels are check instructions, not passing evidence.\n\n${jsonBlock(section)}\n`,
        exact: false
      };
    }
  }
};
