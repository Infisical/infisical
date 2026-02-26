// ═══ TYPES ═══════════════════════════════════════════════════════════
export interface DataRow {
  name: string;
  status: string;
  desc: string;
  scope: string;
  date: string;
  resource?: string;
  resourceLink?: string;
}

export interface StatItem {
  color: string;
  label: string;
  key: string;
  count: number;
}

export interface WidgetFilter {
  resources: string[];
  scopeTypes: string[];
  statuses: string[];
  projectId?: string;
  subOrgIds?: string[];
  scopeMode?: "org" | "suborg" | "project";
}

export interface WidgetTemplate {
  title: string;
  description?: string;
  icon: string;
  iconBg: string;
  borderColor?: string;
  refresh: string;
  stats: StatItem[];
  dataKey: string;
  firstStatus: string;
  isLogs?: boolean;
  isMetrics?: boolean;
  filter?: WidgetFilter;
}

export interface LayoutItem {
  uid: string;
  tmpl: string;
  x: number;
  y: number;
  w: number;
  h: number;
  static?: boolean;
  widgetId?: string;
  customTemplate?: WidgetTemplate;
}

export interface PanelItem {
  id: string;
  tmpl?: string;
  icon: string;
  bg: string;
  name: string;
  desc: string;
  badge: string;
  category: "inf" | "org" | "custom";
  widgetId?: string;
}

export interface SubView {
  id: string;
  name: string;
}

// ═══ RESOURCE TYPES ══════════════════════════════════════════════════
export const RESOURCE_TYPES = [
  { key: "secret-sync", label: "Secret Sync", icon: "RefreshCw", orgOnly: false },
  { key: "secret-rotation", label: "Secret Rotation", icon: "RotateCw", orgOnly: false },
  {
    key: "dynamic-secret-lease",
    label: "Dynamic Secret Lease",
    icon: "Zap",
    orgOnly: false
  },
  {
    key: "machine-identity-token",
    label: "MI Token TTL",
    icon: "Bot",
    orgOnly: false
  },
  { key: "machine-identity-usage", label: "MI Usage", icon: "Activity", orgOnly: false },
  { key: "service-token", label: "Service Token", icon: "Key", orgOnly: false },
  { key: "webhook", label: "Webhook", icon: "Globe", orgOnly: false },
  { key: "pam-session", label: "PAM Session", icon: "Shield", orgOnly: false },
  { key: "user-session", label: "User Session", icon: "Unlock", orgOnly: true },
  { key: "gateway", label: "Gateway", icon: "Server", orgOnly: true },
  { key: "relay", label: "Relay", icon: "Cloud", orgOnly: true },
  { key: "pki-certificate", label: "PKI Certificate", icon: "Lock", orgOnly: false }
] as const;

// ═══ SCOPE TYPES ═════════════════════════════════════════════════════
export const SCOPE_TYPES = [
  { key: "project", label: "Project", color: "#d29922" },
  { key: "org", label: "Organization", color: "#58a6ff" },
  { key: "user", label: "User", color: "#bc8cff" },
  { key: "group", label: "Group", color: "#39d0d8" },
  { key: "mi", label: "Machine Identity", color: "#f0883e" },
  { key: "service_token", label: "Service Token", color: "#8b949e" }
] as const;

// ═══ EVENT TYPES ═════════════════════════════════════════════════════
export const EVENT_TYPES = [
  { key: "active", label: "Active", color: "#3fb950" },
  { key: "failed", label: "Failed", color: "#f85149" },
  { key: "expired", label: "Expired", color: "#d29922" },
  { key: "pending", label: "Pending", color: "#58a6ff" }
] as const;

// ═══ TEMPLATES ════════════════════════════════════════════════════════
export const TEMPLATES: Record<string, WidgetTemplate> = {
  logs: {
    title: "Live Logs",
    description: "Real-time org-wide activity stream",
    icon: "Terminal",
    iconBg: "#1c2a3a",
    refresh: "5s",
    stats: [],
    dataKey: "logs",
    firstStatus: "",
    isLogs: true
  },
  "all-failures": {
    title: "All Failures",
    description: "Monitor all failed resources across the organization",
    icon: "Activity",
    iconBg: "#1c2a3a",
    refresh: "30s",
    stats: [],
    dataKey: "failures",
    firstStatus: "error"
  },
  "secret-syncs": {
    title: "Secret Syncs Monitor",
    description: "Monitor secret sync and rotation failures",
    icon: "RefreshCw",
    iconBg: "#f97316",
    refresh: "30s",
    stats: [],
    dataKey: "secret_syncs",
    firstStatus: ""
  },
  "expiring-certs": {
    title: "Expiring Certificates",
    description: "Certificates expiring within 30 days",
    icon: "Activity",
    iconBg: "#1c2a3a",
    refresh: "30s",
    stats: [],
    dataKey: "expiring_certs",
    firstStatus: ""
  },
  _backend_events: {
    title: "Events",
    description: "",
    icon: "Activity",
    iconBg: "#1c2a3a",
    refresh: "30s",
    stats: [],
    dataKey: "",
    firstStatus: ""
  },
  _backend_metrics: {
    title: "Metrics",
    description: "",
    icon: "Activity",
    iconBg: "#1c2a3a",
    refresh: "30s",
    stats: [],
    dataKey: "",
    firstStatus: "",
    isMetrics: true
  }
};

// ═══ DEFAULT LAYOUT ══════════════════════════════════════════════════
export const DEFAULT_ORG_LAYOUT: LayoutItem[] = [
  { uid: "default-all-failures", tmpl: "all-failures", x: 0, y: 0, w: 6, h: 2 },
  { uid: "default-secret-syncs", tmpl: "secret-syncs", x: 6, y: 0, w: 6, h: 2 },
  { uid: "default-live-logs", tmpl: "logs", x: 0, y: 2, w: 12, h: 2 }
];

// ═══ PANEL ITEMS ═════════════════════════════════════════════════════
// Backend widgets of type "logs", "events", and "metrics" are added dynamically.
export const PANEL_ITEMS: PanelItem[] = [];
