import {
  Activity,
  AlertTriangle,
  Bell,
  Bot,
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
  Unlock,
  Webhook,
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
  AlertTriangle
};

export const AVAILABLE_ICONS = Object.keys(iconMap);

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
  const Icon = iconMap[name];
  if (!Icon) return null;
  return <Icon className={className} size={size} style={style} />;
}
