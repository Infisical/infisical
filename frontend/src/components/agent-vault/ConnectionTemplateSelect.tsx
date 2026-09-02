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
      className="flex items-start gap-3 rounded-md border border-border bg-container p-3 text-left transition-colors hover:bg-container-hover"
    >
      {hasImageError ? (
        <GlobeIcon className="mt-0.5 size-5 shrink-0 text-muted" />
      ) : (
        <img
          src={`/images/integrations/${template.image}`}
          alt=""
          className="mt-0.5 size-5 shrink-0"
          onError={() => setHasImageError(true)}
        />
      )}
      <div className="min-w-0">
        <div className="truncate text-sm">{template.name}</div>
        <div className="truncate text-xs text-accent">{template.description}</div>
      </div>
    </button>
  );
};

const CustomCard = ({ onSelect }: { onSelect: () => void }) => (
  <button
    type="button"
    onClick={onSelect}
    className="flex items-start gap-3 rounded-md border border-dashed border-border p-3 text-left transition-colors hover:bg-container-hover"
  >
    <PlusIcon className="mt-0.5 size-5 shrink-0 text-muted" />
    <div className="min-w-0">
      <div className="truncate text-sm">Custom</div>
      <div className="truncate text-xs text-accent">Name the hosts yourself.</div>
    </div>
  </button>
);

const Grid = ({ children }: { children: React.ReactNode }) => (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">{children}</div>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-2 text-xs text-accent">{children}</div>
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
    <div className="flex flex-col gap-5">
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search services..."
        />
      </InputGroup>

      {filtered ? (
        <Grid>
          {filtered.map((template) => (
            <TemplateCard key={template.key} template={template} onSelect={onSelect} />
          ))}
          <CustomCard onSelect={() => onSelect(null)} />
        </Grid>
      ) : (
        <>
          <div>
            <SectionLabel>Popular</SectionLabel>
            <Grid>
              {popular.map((template) => (
                <TemplateCard key={template.key} template={template} onSelect={onSelect} />
              ))}
              <CustomCard onSelect={() => onSelect(null)} />
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
