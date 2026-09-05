import { useMemo, useState } from "react";
import { GlobeIcon, PlusIcon, SearchIcon } from "lucide-react";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@app/components/v3";
import {
  AGENT_VAULT_TEMPLATES,
  AgentVaultTemplate,
  AgentVaultTemplateCategory,
  POPULAR_AGENT_VAULT_TEMPLATES
} from "@app/helpers/agentVaultTemplates";

const TemplateCard = ({
  template,
  onSelect
}: {
  template: AgentVaultTemplate;
  onSelect: (template: AgentVaultTemplate) => void;
}) => {
  const [hasImageError, setHasImageError] = useState(false);

  return (
    <button
      type="button"
      onClick={() => onSelect(template)}
      className="group flex cursor-pointer flex-col gap-3 rounded-md border border-border bg-card p-4 text-left transition-colors hover:border-mineshaft-500 hover:bg-mineshaft-700/50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex size-9 items-center justify-center rounded-md bg-mineshaft-700">
          {hasImageError ? (
            <GlobeIcon className="size-5 text-bunker-300" />
          ) : (
            <img
              src={`/images/integrations/${template.image}`}
              alt={`${template.name} logo`}
              className="size-6 object-contain"
              onError={() => setHasImageError(true)}
            />
          )}
        </div>
        <span className="text-[10px] font-medium tracking-wider text-muted uppercase">
          {template.category}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-semibold text-foreground">{template.name}</p>
        <p className="text-xs leading-relaxed text-muted">{template.description}</p>
      </div>
    </button>
  );
};

const CustomCard = ({ onSelect }: { onSelect: () => void }) => (
  <button
    type="button"
    onClick={onSelect}
    className="group flex cursor-pointer flex-col gap-3 rounded-md border border-dashed border-mineshaft-500 bg-card p-4 text-left transition-colors hover:border-mineshaft-400 hover:bg-mineshaft-700/50"
  >
    <div className="flex items-start gap-2">
      <div className="flex size-9 items-center justify-center rounded-md bg-mineshaft-700">
        <PlusIcon className="size-5 text-bunker-300" />
      </div>
    </div>
    <div className="flex flex-col gap-1">
      <p className="text-sm font-semibold text-foreground">Custom</p>
      <p className="text-xs leading-relaxed text-muted">Name the hosts yourself.</p>
    </div>
  </button>
);

const Grid = ({ children }: { children: React.ReactNode }) => (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">{children}</div>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-3 text-[11px] font-medium tracking-wider text-muted uppercase">{children}</p>
);

type Props = {
  onSelect: (template: AgentVaultTemplate | null) => void;
};

export const ConnectionTemplateSelect = ({ onSelect }: Props) => {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return null;

    return AGENT_VAULT_TEMPLATES.filter((template) =>
      [template.name, template.category, template.key, ...(template.aliases ?? [])].some((value) =>
        value.toLowerCase().includes(term)
      )
    );
  }, [search]);

  const popular = AGENT_VAULT_TEMPLATES.filter((template) =>
    POPULAR_AGENT_VAULT_TEMPLATES.includes(template.key)
  );

  return (
    <div className="flex flex-col gap-6">
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search services — OpenAI, Anthropic, Slack, GitHub..."
        />
      </InputGroup>

      {filtered ? (
        <Grid>
          <CustomCard onSelect={() => onSelect(null)} />
          {filtered.map((template) => (
            <TemplateCard key={template.key} template={template} onSelect={onSelect} />
          ))}
        </Grid>
      ) : (
        <>
          <div>
            <SectionLabel>Popular</SectionLabel>
            <Grid>
              <CustomCard onSelect={() => onSelect(null)} />
              {popular.map((template) => (
                <TemplateCard key={template.key} template={template} onSelect={onSelect} />
              ))}
            </Grid>
          </div>
          {Object.values(AgentVaultTemplateCategory).map((category) => {
            const templates = AGENT_VAULT_TEMPLATES.filter(
              (template) => template.category === category
            );
            if (templates.length === 0) return null;

            return (
              <div key={category}>
                <SectionLabel>{category}</SectionLabel>
                <Grid>
                  {templates.map((template) => (
                    <TemplateCard key={template.key} template={template} onSelect={onSelect} />
                  ))}
                </Grid>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
};
