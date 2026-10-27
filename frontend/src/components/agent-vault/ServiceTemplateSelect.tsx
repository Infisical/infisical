import { ReactNode, useMemo, useState } from "react";
import { GlobeIcon, PlusIcon, SearchIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

import {
  CardTitle,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Tabs,
  TabsList,
  TabsTrigger
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

type TTypeFilter = AgentVaultServiceType | "all";

const MCP_SECTION_DESCRIPTION =
  "Remote MCP servers. The proxy attaches the credential to requests for them.";
const HTTP_SECTION_DESCRIPTION =
  "Web APIs your agent calls directly. The proxy attaches the credential to requests for their hosts.";

const TYPE_FILTERS: { value: TTypeFilter; label: string }[] = [
  { value: "all", label: "All Types" },
  { value: AgentVaultServiceType.Mcp, label: "MCP Servers" },
  { value: AgentVaultServiceType.Http, label: "HTTP APIs" }
];

// MCP cards sit under the "MCP Servers" heading, so a tag would only repeat it.
const templateTag = (template: AgentVaultTemplate) =>
  template.serviceType === AgentVaultServiceType.Mcp ? undefined : template.category;

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
  const [typeFilter, setTypeFilter] = useState<TTypeFilter>("all");

  const showsHttp = typeFilter !== AgentVaultServiceType.Mcp;
  const showsMcp = typeFilter !== AgentVaultServiceType.Http;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return null;

    const matches = (template: AgentVaultTemplate) =>
      [template.name, template.key, templateTag(template) ?? "", ...(template.aliases ?? [])].some(
        (value) => value.toLowerCase().includes(term)
      );
    return {
      mcp: AGENT_VAULT_MCP_TEMPLATES.filter(matches),
      http: AGENT_VAULT_TEMPLATES.filter(matches)
    };
  }, [search]);

  const popular = AGENT_VAULT_TEMPLATES.filter((template) =>
    POPULAR_AGENT_VAULT_TEMPLATES.includes(template.key)
  );

  const select = (template: AgentVaultTemplate) => onSelect(template, template.serviceType);

  const customHttpCard = (
    <CustomCard
      name="Custom HTTP API"
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

  // Each section keeps its custom card even when nothing of its type matches, so a custom service is always one
  // click away.
  const renderSearch = ({
    mcp,
    http
  }: {
    mcp: AgentVaultTemplate[];
    http: AgentVaultTemplate[];
  }) => (
    <>
      {showsMcp && (
        <div>
          <SectionHeader title="MCP Servers" description={MCP_SECTION_DESCRIPTION} />
          <Grid>
            {customMcpCard}
            {mcp.map((template) => (
              <TemplateCard key={template.key} template={template} onSelect={select} />
            ))}
          </Grid>
        </div>
      )}
      {showsHttp && (
        <div>
          <SectionHeader title="HTTP APIs" description={HTTP_SECTION_DESCRIPTION} />
          <Grid>
            {customHttpCard}
            {http.map((template) => (
              <TemplateCard key={template.key} template={template} onSelect={select} />
            ))}
          </Grid>
        </div>
      )}
    </>
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
      <aside className="flex w-54 shrink-0 flex-col border-r border-border px-5 py-6">
        <SectionLabel>Service Types</SectionLabel>
        <Tabs
          orientation="vertical"
          value={typeFilter}
          onValueChange={(value) => setTypeFilter(value as TTypeFilter)}
        >
          <TabsList variant="av" aria-label="Service types">
            {TYPE_FILTERS.map((filter) => (
              <TabsTrigger key={filter.value} value={filter.value}>
                {filter.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
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

        {filtered ? renderSearch(filtered) : renderBrowse()}
      </div>
    </div>
  );
};
