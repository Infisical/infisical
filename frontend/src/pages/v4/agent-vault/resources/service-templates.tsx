import { type ReactNode, useMemo, useState } from "react";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Icon } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { Tile } from "@infisical/cipher/ui/item";
import { Grid, Stack } from "@infisical/cipher/ui/layout";
import { Tabs, TabsList, TabsTrigger } from "@infisical/cipher/ui/tabs";

import {
  AGENT_VAULT_MCP_TEMPLATES,
  AGENT_VAULT_TEMPLATES,
  type AgentVaultTemplate,
  AgentVaultTemplateCategory,
  POPULAR_AGENT_VAULT_TEMPLATES
} from "@app/helpers/agentVaultTemplates";
import {
  AGENT_VAULT_NATIVE_SERVICE_TYPES,
  AgentVaultServiceType,
  type TAgentVaultNativeServiceType
} from "@app/hooks/api/agentVault/enums";

import { ProviderIcon } from "../../components/provider-icon";
import { NATIVE_SERVICE_META } from "./agent-vault-utils";

import css from "./resources.module.css";

type TTypeFilter = "all" | "mcp" | "http" | "native";

const TYPE_FILTERS: { value: TTypeFilter; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "mcp", label: "MCP servers" },
  { value: "http", label: "HTTP APIs" },
  { value: "native", label: "Databases and more" }
];

const NATIVE_DESCRIPTIONS: Record<TAgentVaultNativeServiceType, string> = {
  [AgentVaultServiceType.Postgres]: "A PostgreSQL database agents query by name",
  [AgentVaultServiceType.Mysql]: "A MySQL database agents query by name",
  [AgentVaultServiceType.Ssh]: "A server agents reach over SSH"
};

const templateTag = (template: AgentVaultTemplate) =>
  template.serviceType === AgentVaultServiceType.Mcp ? undefined : template.category;

const Section = ({ title, children }: { title?: string; children: ReactNode }) => (
  <section className={css.templateSection}>
    {title && <p className={css.eyebrow}>{title}</p>}
    <Grid gap={12} columns={3}>
      {children}
    </Grid>
  </section>
);

export const ServiceTemplatePicker = ({
  onSelect
}: {
  onSelect: (template: AgentVaultTemplate | null, serviceType: AgentVaultServiceType) => void;
}) => {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TTypeFilter>("all");
  const term = search.trim().toLowerCase();
  const showsMcp = typeFilter === "all" || typeFilter === "mcp";
  const showsHttp = typeFilter === "all" || typeFilter === "http";
  const showsNative = typeFilter === "all" || typeFilter === "native";

  const filtered = useMemo(() => {
    const matches = (template: AgentVaultTemplate) =>
      !term ||
      [template.name, template.key, templateTag(template) ?? "", ...(template.aliases ?? [])].some(
        (value) => value.toLowerCase().includes(term)
      );
    return {
      mcp: AGENT_VAULT_MCP_TEMPLATES.filter(matches),
      http: AGENT_VAULT_TEMPLATES.filter(matches),
      native: AGENT_VAULT_NATIVE_SERVICE_TYPES.filter(
        (serviceType) =>
          !term ||
          [
            NATIVE_SERVICE_META[serviceType].label,
            serviceType,
            ...NATIVE_SERVICE_META[serviceType].aliases
          ].some((value) => value.toLowerCase().includes(term))
      )
    };
  }, [term]);

  const card = (template: AgentVaultTemplate) => (
    <Tile
      key={`${template.serviceType}:${template.key}`}
      media={<ProviderIcon icon={template.image} alt="" />}
      title={template.name}
      description={template.description}
      onClick={() => onSelect(template, template.serviceType)}
    />
  );
  const customCard = (serviceType: AgentVaultServiceType.Http | AgentVaultServiceType.Mcp) => (
    <Tile
      key={`custom:${serviceType}`}
      media={<Icon name="plus" />}
      title={serviceType === AgentVaultServiceType.Mcp ? "Custom MCP server" : "Custom HTTP API"}
      description={
        serviceType === AgentVaultServiceType.Mcp
          ? "Connect any remote MCP server by its URL"
          : "Configure the hosts yourself"
      }
      onClick={() => onSelect(null, serviceType)}
    />
  );
  const nativeCard = (serviceType: TAgentVaultNativeServiceType) => (
    <Tile
      key={serviceType}
      media={<ProviderIcon icon={NATIVE_SERVICE_META[serviceType].image} alt="" />}
      title={NATIVE_SERVICE_META[serviceType].label}
      description={NATIVE_DESCRIPTIONS[serviceType]}
      onClick={() => onSelect(null, serviceType)}
    />
  );
  const popular = AGENT_VAULT_TEMPLATES.filter((template) =>
    POPULAR_AGENT_VAULT_TEMPLATES.includes(template.key)
  );

  const httpSections = term ? (
    <Section title="HTTP APIs">
      {customCard(AgentVaultServiceType.Http)}
      {filtered.http.map(card)}
    </Section>
  ) : (
    <>
      <Section title="Popular HTTP APIs">
        {customCard(AgentVaultServiceType.Http)}
        {popular.map(card)}
      </Section>
      {Object.values(AgentVaultTemplateCategory).map((category) => {
        const templates = AGENT_VAULT_TEMPLATES.filter(
          (template) => template.category === category
        );
        if (!templates.length) return null;
        return (
          <Section key={category} title={category}>
            {templates.map(card)}
          </Section>
        );
      })}
    </>
  );

  const nativeSection = () => {
    if (filtered.native.length)
      return (
        <Section title="Databases and other protocols">{filtered.native.map(nativeCard)}</Section>
      );
    if (typeFilter !== "native") return null;
    return (
      <EmptyState
        icon="search"
        title="No matching databases or servers"
        description="Try a different search term."
      />
    );
  };

  return (
    <Stack gap={24}>
      <Stack gap={12}>
        <Input
          icon="search"
          aria-label="Search service templates"
          value={search}
          placeholder="Search templates, such as OpenAI, Linear MCP or PostgreSQL"
          onChange={(event) => setSearch(event.target.value)}
        />
        <Tabs
          variant="segmented"
          label="Service types"
          value={typeFilter}
          onValueChange={(value) => setTypeFilter(value as TTypeFilter)}
        >
          <TabsList>
            {TYPE_FILTERS.map((filter) => (
              <TabsTrigger key={filter.value} value={filter.value}>
                {filter.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </Stack>
      {showsMcp && (
        <Section title="MCP servers">
          {customCard(AgentVaultServiceType.Mcp)}
          {filtered.mcp.map(card)}
        </Section>
      )}
      {showsHttp && httpSections}
      {showsNative && nativeSection()}
    </Stack>
  );
};
