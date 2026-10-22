import { ReactNode, useMemo, useState } from "react";
import { GlobeIcon, PlusIcon, SearchIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  Button,
  CardTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@app/components/v3";
import { ProviderIcon } from "@app/components/v3/platform/ProviderIcon";
import {
  AGENT_VAULT_MCP_TEMPLATES,
  AGENT_VAULT_TEMPLATES,
  AgentVaultTemplate,
  AgentVaultTemplateCategory,
  POPULAR_AGENT_VAULT_TEMPLATES
} from "@app/helpers/agentVaultTemplates";
import { AgentVaultServiceType } from "@app/hooks/api/agentVault";

enum TypeFilter {
  All = "all",
  Http = "http",
  Mcp = "mcp"
}

const MCP_SECTION_DESCRIPTION =
  "Remote MCP servers. The proxy attaches the credential to requests for them.";
const HTTP_SECTION_DESCRIPTION =
  "Web APIs your agent calls directly. The proxy attaches the credential to requests for their hosts.";

// Each count includes the type's Custom card, so it matches the cards the filter shows.
const TYPE_FILTERS: { value: TypeFilter; label: string; count: number }[] = [
  {
    value: TypeFilter.All,
    label: "All Types",
    count: AGENT_VAULT_TEMPLATES.length + AGENT_VAULT_MCP_TEMPLATES.length + 2
  },
  { value: TypeFilter.Http, label: "HTTP APIs", count: AGENT_VAULT_TEMPLATES.length + 1 },
  { value: TypeFilter.Mcp, label: "MCP Servers", count: AGENT_VAULT_MCP_TEMPLATES.length + 1 }
];

const templateTag = (template: AgentVaultTemplate) =>
  template.serviceType === AgentVaultServiceType.Mcp ? "MCP Server" : template.category;

const SelectableCard = ({
  media,
  tag,
  name,
  description,
  isCustom,
  onSelect
}: {
  media: ReactNode;
  tag?: string;
  name: string;
  description: string;
  isCustom?: boolean;
  onSelect: () => void;
}) => (
  <button
    type="button"
    onClick={onSelect}
    className={twMerge(
      "group flex cursor-pointer flex-col gap-3 rounded-md border border-border bg-card p-4 text-left transition-colors hover:border-border-strong hover:bg-surface-hover/50",
      isCustom && "border-dashed border-border-strong hover:border-border-emphasis"
    )}
  >
    <div className="flex items-start justify-between gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-surface-hover">
        {media}
      </div>
      {tag && (
        <span className="text-[10px] font-medium tracking-wider text-muted uppercase">{tag}</span>
      )}
    </div>
    <div className="flex flex-col gap-1">
      <p className="text-sm font-semibold text-foreground">{name}</p>
      <p className="text-xs leading-relaxed text-muted">{description}</p>
    </div>
  </button>
);

const TemplateCard = ({
  template,
  onSelect
}: {
  template: AgentVaultTemplate;
  onSelect: (template: AgentVaultTemplate) => void;
}) => {
  const [hasImageError, setHasImageError] = useState(false);

  return (
    <SelectableCard
      media={
        hasImageError ? (
          <GlobeIcon className="h-5 w-5 text-label-secondary" />
        ) : (
          <ProviderIcon
            icon={template.image}
            alt={`${template.name} logo`}
            className="h-6 w-6 object-contain"
            onError={() => setHasImageError(true)}
          />
        )
      }
      tag={templateTag(template)}
      name={template.name}
      description={template.description}
      onSelect={() => onSelect(template)}
    />
  );
};

const CustomCard = ({
  name,
  description,
  onSelect
}: {
  name: string;
  description: string;
  onSelect: () => void;
}) => (
  <SelectableCard
    media={<PlusIcon className="h-5 w-5 text-label-secondary" />}
    name={name}
    description={description}
    isCustom
    onSelect={onSelect}
  />
);

const Grid = ({ children }: { children: ReactNode }) => (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">{children}</div>
);

const SectionLabel = ({ children }: { children: ReactNode }) => (
  <p className="mb-3 text-[11px] font-medium tracking-wider text-muted uppercase">{children}</p>
);

const SectionHeader = ({ title, description }: { title: string; description: string }) => (
  <div className="mb-4">
    <CardTitle className="text-sm leading-snug">{title}</CardTitle>
    <p className="mt-0.5 text-xs text-muted">{description}</p>
  </div>
);

type Props = {
  onSelect: (template: AgentVaultTemplate | null, serviceType: AgentVaultServiceType) => void;
};

export const ServiceTemplateSelect = ({ onSelect }: Props) => {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState(TypeFilter.All);

  const showsHttp = typeFilter !== TypeFilter.Mcp;
  const showsMcp = typeFilter !== TypeFilter.Http;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return null;

    const candidates: AgentVaultTemplate[] = [
      ...(showsMcp ? AGENT_VAULT_MCP_TEMPLATES : []),
      ...(showsHttp ? AGENT_VAULT_TEMPLATES : [])
    ];
    return candidates.filter((template) =>
      [template.name, templateTag(template), template.key, ...(template.aliases ?? [])].some(
        (value) => value.toLowerCase().includes(term)
      )
    );
  }, [search, showsHttp, showsMcp]);

  const popular = AGENT_VAULT_TEMPLATES.filter((template) =>
    POPULAR_AGENT_VAULT_TEMPLATES.includes(template.key)
  );

  const select = (template: AgentVaultTemplate) => onSelect(template, template.serviceType);

  const customHttpCard = (
    <CustomCard
      name="Custom"
      description="Configure the hosts yourself."
      onSelect={() => onSelect(null, AgentVaultServiceType.Http)}
    />
  );
  const customMcpCard = (
    <CustomCard
      name="Custom MCP Server"
      description="Connect any remote MCP server by its URL."
      onSelect={() => onSelect(null, AgentVaultServiceType.Mcp)}
    />
  );

  const renderBrowse = () => (
    <>
      {showsMcp && (
        <div>
          <SectionHeader title="MCP Servers" description={MCP_SECTION_DESCRIPTION} />
          <Grid>
            {customMcpCard}
            {AGENT_VAULT_MCP_TEMPLATES.map((template) => (
              <TemplateCard key={template.key} template={template} onSelect={select} />
            ))}
          </Grid>
        </div>
      )}
      {showsHttp && (
        <div>
          <SectionHeader title="HTTP APIs" description={HTTP_SECTION_DESCRIPTION} />
          <SectionLabel>Popular</SectionLabel>
          <Grid>
            {customHttpCard}
            {popular.map((template) => (
              <TemplateCard key={template.key} template={template} onSelect={select} />
            ))}
          </Grid>
        </div>
      )}
      {showsHttp &&
        Object.values(AgentVaultTemplateCategory).map((category) => {
          const templates = AGENT_VAULT_TEMPLATES.filter(
            (template) => template.category === category
          );
          if (templates.length === 0) return null;

          return (
            <div key={category}>
              <SectionLabel>{category}</SectionLabel>
              <Grid>
                {templates.map((template) => (
                  <TemplateCard key={template.key} template={template} onSelect={select} />
                ))}
              </Grid>
            </div>
          );
        })}
    </>
  );

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border px-5 py-6">
        <p className="mb-3 text-[11px] font-medium tracking-wider text-muted uppercase">
          Service Types
        </p>
        <div role="group" aria-label="Service types" className="flex flex-col gap-0.5">
          {TYPE_FILTERS.map((filter) => {
            const isActive = filter.value === typeFilter;
            return (
              <Button
                key={filter.value}
                type="button"
                variant={isActive ? "outline" : "ghost"}
                isFullWidth
                aria-pressed={isActive}
                onClick={() => setTypeFilter(filter.value)}
                className="justify-between"
              >
                {filter.label}
                <span className="text-xs text-muted tabular-nums">{filter.count}</span>
              </Button>
            );
          })}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
        <InputGroup>
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search service templates"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates (e.g., OpenAI, Anthropic, Linear MCP, GitHub...)"
          />
        </InputGroup>

        {filtered ? (
          <Grid>
            {showsMcp && customMcpCard}
            {showsHttp && customHttpCard}
            {filtered.map((template) => (
              <TemplateCard key={template.key} template={template} onSelect={select} />
            ))}
          </Grid>
        ) : (
          renderBrowse()
        )}
      </div>
    </div>
  );
};
