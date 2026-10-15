import { ReactNode, useMemo, useState } from "react";
import { GlobeIcon, PlusIcon, SearchIcon } from "lucide-react";

import {
  Badge,
  Button,
  CardTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@app/components/v3";
import { ProviderIcon } from "@app/components/v3/platform/ProviderIcon";
import { cn } from "@app/components/v3/utils";
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
  "Remote MCP servers. The proxy attaches the credential and logs each tool call.";
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

const TemplateCard = ({
  template,
  onSelect
}: {
  template: AgentVaultTemplate;
  onSelect: (template: AgentVaultTemplate) => void;
}) => {
  const [hasImageError, setHasImageError] = useState(false);

  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => onSelect(template)}
      className="group h-auto w-full flex-col items-stretch gap-3 bg-card p-4 text-left whitespace-normal hover:bg-container-hover"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex size-9 items-center justify-center rounded-md bg-container">
          {hasImageError ? (
            <GlobeIcon className="size-5 text-muted" />
          ) : (
            <ProviderIcon
              icon={template.image}
              alt={`${template.name} logo`}
              className="size-6 object-contain"
              onError={() => setHasImageError(true)}
            />
          )}
        </div>
        <Badge variant="outline">{templateTag(template)}</Badge>
      </div>
      <div className="flex flex-col gap-1">
        <CardTitle className="text-sm leading-snug">{template.name}</CardTitle>
        <p className="text-xs leading-relaxed text-muted">{template.description}</p>
      </div>
    </Button>
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
  <Button
    type="button"
    variant="outline"
    onClick={onSelect}
    className="group h-auto w-full flex-col items-stretch gap-3 border-dashed bg-card p-4 text-left whitespace-normal hover:bg-container-hover"
  >
    <div className="flex items-start gap-2">
      <div className="flex size-9 items-center justify-center rounded-md bg-container">
        <PlusIcon className="size-5 text-muted" />
      </div>
    </div>
    <div className="flex flex-col gap-1">
      <CardTitle className="text-sm leading-snug">{name}</CardTitle>
      <p className="text-xs leading-relaxed text-muted">{description}</p>
    </div>
  </Button>
);

const Grid = ({ children }: { children: ReactNode }) => (
  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">{children}</div>
);

const SectionLabel = ({ children }: { children: ReactNode }) => (
  <p className="mb-3 text-[11px] font-medium tracking-wider text-muted uppercase">{children}</p>
);

const SectionHeader = ({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) => (
  <div className="mb-4 flex items-end justify-between gap-4">
    <div>
      <CardTitle className="text-sm leading-snug">{title}</CardTitle>
      <p className="mt-0.5 text-xs text-muted">{description}</p>
    </div>
    {action}
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
          <SectionHeader
            title="HTTP APIs"
            description={HTTP_SECTION_DESCRIPTION}
            action={
              typeFilter === TypeFilter.All && (
                <Button variant="ghost" size="xs" onClick={() => setTypeFilter(TypeFilter.Http)}>
                  View All
                </Button>
              )
            }
          />
          <SectionLabel>Popular</SectionLabel>
          <Grid>
            {customHttpCard}
            {popular.map((template) => (
              <TemplateCard key={template.key} template={template} onSelect={select} />
            ))}
          </Grid>
        </div>
      )}
      {typeFilter === TypeFilter.Http &&
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
                variant="ghost"
                aria-pressed={isActive}
                onClick={() => setTypeFilter(filter.value)}
                className={cn(
                  "w-full justify-between text-left",
                  isActive
                    ? "bg-container-hover text-foreground"
                    : "text-muted hover:bg-container-hover/50 hover:text-foreground"
                )}
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
