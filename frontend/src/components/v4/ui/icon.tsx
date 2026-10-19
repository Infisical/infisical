import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  Bell,
  Bot,
  Building2,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CircleAlert,
  CircleCheck,
  Clock,
  Copy,
  Download,
  Ellipsis,
  ExternalLink,
  Eye,
  File,
  Folder,
  FolderOpen,
  GitBranch,
  Globe,
  History,
  House,
  Inbox,
  Info,
  KeyRound,
  LayoutGrid,
  Link,
  Lock,
  type LucideIcon,
  Megaphone,
  Menu,
  Minus,
  Monitor,
  Moon,
  PanelLeft,
  Plus,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  SquareTerminal,
  Sun,
  Trash2,
  TriangleAlert,
  Upload,
  User,
  UserPlus,
  X
} from "lucide-react";

export const iconMap = {
  search: Search,
  key: KeyRound,
  plus: Plus,
  minus: Minus,
  check: Check,
  x: X,
  "chev-down": ChevronDown,
  "chev-right": ChevronRight,
  "chev-left": ChevronLeft,
  "chev-ud": ChevronsUpDown,
  more: Ellipsis,
  copy: Copy,
  eye: Eye,
  history: History,
  trash: Trash2,
  lock: Lock,
  info: Info,
  alert: TriangleAlert,
  "alert-c": CircleAlert,
  "check-c": CircleCheck,
  agent: Bot,
  machine: Server,
  cert: ShieldCheck,
  terminal: SquareTerminal,
  user: User,
  external: ExternalLink,
  sync: RefreshCw,
  upload: Upload,
  clock: Clock,
  folder: Folder,
  link: Link,
  settings: SlidersHorizontal,
  bell: Bell,
  globe: Globe,
  inbox: Inbox,
  home: House,
  "arrow-down": ArrowDown,
  git: GitBranch,
  calendar: Calendar,
  "arrow-up": ArrowUp,
  file: File,
  "folder-open": FolderOpen,
  download: Download,
  menu: Menu,
  sidebar: PanelLeft,
  "user-plus": UserPlus,
  megaphone: Megaphone,
  apps: LayoutGrid,
  building: Building2,
  sun: Sun,
  moon: Moon,
  monitor: Monitor
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof iconMap;
export const iconNames = Object.keys(iconMap) as IconName[];

type IconProps = Omit<React.ComponentPropsWithoutRef<"svg">, "name"> & {
  name?: IconName;
  icon?: LucideIcon;
  size?: number | string;
  label?: string;
};

export const Icon = React.forwardRef<SVGSVGElement, IconProps>(
  ({ name, icon, size, strokeWidth, label, style, ...props }, ref) => {
    const Glyph = icon ?? (name ? iconMap[name] : undefined);
    if (!Glyph) return null;
    const dimension = typeof size === "number" ? `${size}px` : size;
    return (
      <Glyph
        ref={ref}
        data-slot="icon"
        data-icon-name={name}
        role={label ? "img" : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        focusable="false"
        style={{ width: dimension, height: dimension, strokeWidth, ...style }}
        {...props}
      />
    );
  }
);
Icon.displayName = "Icon";
