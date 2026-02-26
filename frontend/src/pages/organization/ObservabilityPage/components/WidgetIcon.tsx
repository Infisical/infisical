import {
  Activity,
  AlertTriangle,
  Bell,
  Bot,
  Clock,
  Cloud,
  ClipboardList,
  Database,
  Eye,
  FileText,
  GitBranch,
  Globe,
  Key,
  Lock,
  RefreshCw,
  RotateCw,
  Server,
  Shield,
  Terminal,
  Timer,
  Unlock,
  Users,
  Webhook,
  XCircle,
  Zap
} from "lucide-react";

const iconMap: Record<string, React.ElementType> = {
  RefreshCw,
  RotateCw,
  Bot,
  Webhook,
  Shield,
  Unlock,
  Terminal,
  ClipboardList,
  Activity,
  Database,
  Eye,
  Globe,
  Key,
  Lock,
  Server,
  Zap,
  Bell,
  FileText,
  GitBranch,
  Cloud,
  AlertTriangle,
  Clock,
  Timer,
  Users,
  XCircle
};

export const AVAILABLE_ICONS = Object.keys(iconMap);

const iconAliases: Record<string, string> = {
  activity: "Activity",
  "alert-triangle": "AlertTriangle",
  alerttriangle: "AlertTriangle",
  bell: "Bell",
  bot: "Bot",
  clock: "Clock",
  cloud: "Cloud",
  clipboardlist: "ClipboardList",
  "clipboard-list": "ClipboardList",
  database: "Database",
  eye: "Eye",
  filetext: "FileText",
  "file-text": "FileText",
  gitbranch: "GitBranch",
  "git-branch": "GitBranch",
  globe: "Globe",
  key: "Key",
  lock: "Lock",
  refreshcw: "RefreshCw",
  "refresh-cw": "RefreshCw",
  rotatecw: "RotateCw",
  "rotate-cw": "RotateCw",
  server: "Server",
  shield: "Shield",
  terminal: "Terminal",
  timer: "Timer",
  unlock: "Unlock",
  users: "Users",
  webhook: "Webhook",
  xcircle: "XCircle",
  "x-circle": "XCircle",
  zap: "Zap"
};

const toPascalCase = (value: string) =>
  value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");

export function WidgetIcon({
  name,
  className,
  size = 14,
  style
}: {
  name: string;
  className?: string;
  size?: number;
  style?: React.CSSProperties;
}) {
  const normalizedName =
    iconAliases[name.toLowerCase()] ||
    iconAliases[name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase()] ||
    toPascalCase(name) ||
    name;
  const Icon = iconMap[name] || iconMap[normalizedName];
  if (!Icon) return null;
  return <Icon className={className} size={size} style={style} />;
}
