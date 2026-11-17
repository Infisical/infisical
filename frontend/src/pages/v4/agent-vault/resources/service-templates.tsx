import { TilePicker, type TilePickerItem } from "@infisical/cipher/patterns/tile-picker";

import {
  AGENT_VAULT_MCP_TEMPLATES,
  AGENT_VAULT_TEMPLATES,
  type AgentVaultTemplate,
  POPULAR_AGENT_VAULT_TEMPLATES
} from "@app/helpers/agentVaultTemplates";
import {
  AGENT_VAULT_NATIVE_SERVICE_TYPES,
  AgentVaultServiceType,
  type TAgentVaultNativeServiceType
} from "@app/hooks/api/agentVault/enums";

import { ProviderIcon } from "../../components/provider-icon";
import { NATIVE_SERVICE_META } from "./agent-vault-utils";

type TTemplateItem = TilePickerItem & {
  template: AgentVaultTemplate | null;
  serviceType: AgentVaultServiceType;
};

const NATIVE_EYEBROWS: Record<TAgentVaultNativeServiceType, string> = {
  [AgentVaultServiceType.Postgres]: "Database",
  [AgentVaultServiceType.Mysql]: "Database",
  [AgentVaultServiceType.Ssh]: "Server"
};

const ITEMS: TTemplateItem[] = [
  {
    value: "custom:mcp",
    title: "Custom MCP server",
    description: "Connect any remote MCP server by its URL",
    eyebrow: "MCP server",
    icon: "plus",
    popular: true,
    pinned: true,
    template: null,
    serviceType: AgentVaultServiceType.Mcp
  },
  {
    value: "custom:http",
    title: "Custom HTTP API",
    description: "Configure the hosts yourself",
    eyebrow: "HTTP API",
    icon: "plus",
    popular: true,
    pinned: true,
    template: null,
    serviceType: AgentVaultServiceType.Http
  },
  ...[...AGENT_VAULT_MCP_TEMPLATES, ...AGENT_VAULT_TEMPLATES]
    .sort((first, second) => first.name.localeCompare(second.name))
    .map((template) => ({
      value: `${template.serviceType}:${template.key}`,
      title: template.name,
      eyebrow:
        template.serviceType === AgentVaultServiceType.Mcp ? "MCP server" : template.category,
      media: <ProviderIcon icon={template.image} alt="" />,
      popular:
        template.serviceType !== AgentVaultServiceType.Mcp &&
        POPULAR_AGENT_VAULT_TEMPLATES.includes(template.key),
      keywords: [template.key, ...(template.aliases ?? [])],
      template,
      serviceType: template.serviceType
    })),
  ...AGENT_VAULT_NATIVE_SERVICE_TYPES.map((serviceType) => ({
    value: serviceType,
    title: NATIVE_SERVICE_META[serviceType].label,
    eyebrow: NATIVE_EYEBROWS[serviceType],
    media: <ProviderIcon icon={NATIVE_SERVICE_META[serviceType].image} alt="" />,
    keywords: [serviceType, ...NATIVE_SERVICE_META[serviceType].aliases],
    template: null,
    serviceType
  }))
];

export const ServiceTemplatePicker = ({
  onSelect
}: {
  onSelect: (template: AgentVaultTemplate | null, serviceType: AgentVaultServiceType) => void;
}) => (
  <TilePicker
    items={ITEMS}
    onSelect={(value) => {
      const item = ITEMS.find((entry) => entry.value === value);
      if (item) onSelect(item.template, item.serviceType);
    }}
    searchLabel="Search service templates"
    searchPlaceholder="Search templates, such as OpenAI, Linear MCP or PostgreSQL"
    allLabel="All templates"
    noun="templates"
  />
);
