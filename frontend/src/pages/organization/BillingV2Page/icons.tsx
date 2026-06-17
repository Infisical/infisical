import { CSSProperties, ReactNode } from "react";

export type IconProps = {
  size?: number;
  stroke?: number;
  fill?: string;
  className?: string;
  style?: CSSProperties;
};

type IconBaseProps = IconProps & { d: ReactNode };

const Icon = ({
  d,
  size = 16,
  stroke = 1.75,
  fill = "none",
  className = "ico",
  style
}: IconBaseProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    style={style}
  >
    {d}
  </svg>
);

export const IconKey = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <circle cx="7.5" cy="15.5" r="5.5" />
        <path d="m21 2-9.6 9.6" />
        <path d="m15.5 7.5 3 3L22 7l-3-3" />
      </>
    }
  />
);

export const IconShieldCheck = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
        <path d="m9 12 2 2 4-4" />
      </>
    }
  />
);

export const IconLock = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </>
    }
  />
);

export const IconScan = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M3 7V5a2 2 0 0 1 2-2h2" />
        <path d="M17 3h2a2 2 0 0 1 2 2v2" />
        <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
        <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
        <path d="M7 12h10" />
      </>
    }
  />
);

export const IconZap = (p: IconProps) => (
  <Icon {...p} d={<path d="M13 2 3 14h9l-1 8 10-12h-9z" />} />
);

export const IconPlus = (p: IconProps) => <Icon {...p} d={<path d="M12 5v14M5 12h14" />} />;

export const IconCheck = (p: IconProps) => <Icon {...p} d={<path d="M20 6 9 17l-5-5" />} />;

export const IconX = (p: IconProps) => <Icon {...p} d={<path d="M18 6 6 18M6 6l12 12" />} />;

export const IconTrash = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M3 6h18" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </>
    }
  />
);

export const IconExternal = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6" />
        <path d="m14 4 6 6" />
        <path d="M21 3h-7v7" />
      </>
    }
  />
);

export const IconDownload = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <path d="M7 10l5 5 5-5" />
        <path d="M12 15V3" />
      </>
    }
  />
);

export const IconAlert = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </>
    }
  />
);

export const IconAlertCircle = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </>
    }
  />
);

export const IconInfo = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 16v-4" />
        <path d="M12 8h.01" />
      </>
    }
  />
);

export const IconCalendar = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
      </>
    }
  />
);

export const IconCreditCard = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
      </>
    }
  />
);

export const IconReceipt = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z" />
        <path d="M8 7h8M8 11h8M8 15h5" />
      </>
    }
  />
);

export const IconBuilding = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <path d="M9 22v-4h6v4" />
        <path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01" />
      </>
    }
  />
);

export const IconShoppingBag = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
        <path d="M3 6h18" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </>
    }
  />
);

export const IconLayers = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <path d="m12 2 9 5-9 5-9-5 9-5z" />
        <path d="m3 12 9 5 9-5" />
        <path d="m3 17 9 5 9-5" />
      </>
    }
  />
);

export const IconChevronRight = (p: IconProps) => (
  <Icon stroke={2} {...p} d={<path d="m9 18 6-6-6-6" />} />
);

export const IconChevronLeft = (p: IconProps) => (
  <Icon stroke={2} {...p} d={<path d="m15 18-6-6 6-6" />} />
);

export const IconChevronDown = (p: IconProps) => (
  <Icon stroke={2} {...p} d={<path d="m6 9 6 6 6-6" />} />
);

export const IconArrowRight = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
      </>
    }
  />
);

export const IconArrowUp = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M12 19V5" />
        <path d="m5 12 7-7 7 7" />
      </>
    }
  />
);

export const IconMinus = (p: IconProps) => <Icon {...p} d={<path d="M5 12h14" />} />;

export const IconRefresh = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
        <path d="M3 21v-5h5" />
      </>
    }
  />
);

export const IconLink = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
      </>
    }
  />
);

export const IconBuilding2 = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
        <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" />
        <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" />
        <path d="M10 6h4M10 10h4M10 14h4M10 18h4" />
      </>
    }
  />
);

export const IconChevronsUpDown = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <path d="m7 15 5 5 5-5" />
        <path d="m7 9 5-5 5 5" />
      </>
    }
  />
);

export const IconServer = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <rect width="20" height="8" x="2" y="2" rx="2" />
        <rect width="20" height="8" x="2" y="14" rx="2" />
        <line x1="6" x2="6.01" y1="6" y2="6" />
        <line x1="6" x2="6.01" y1="18" y2="18" />
      </>
    }
  />
);

export const IconHelp = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <path d="M12 17h.01" />
      </>
    }
  />
);

export const IconBell = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M10.27 21a2 2 0 0 0 3.46 0" />
        <path d="M13.92 2.31A6 6 0 0 0 6 8c0 4.5-1.41 5.96-2.74 7.33A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.67 9 9 0 0 1-.59-.66" />
        <circle cx="18" cy="8" r="3" />
      </>
    }
  />
);

export const IconUser = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </>
    }
  />
);

export const IconPanelLeft = (p: IconProps) => (
  <Icon
    stroke={1.5}
    {...p}
    d={
      <>
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M9 3v18" />
      </>
    }
  />
);

export const IconSettings = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </>
    }
  />
);

export const IconShield = (p: IconProps) => (
  <Icon {...p} d={<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />} />
);

export const IconActivity = (p: IconProps) => (
  <Icon {...p} d={<polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />} />
);

export const IconFileText = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
        <path d="M14 2v4a2 2 0 0 0 2 2h4" />
        <path d="M16 13H8M16 17H8M10 9H8" />
      </>
    }
  />
);

export const IconBox = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </>
    }
  />
);

export const IconUsers = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    }
  />
);

export const IconPlug = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M12 22v-5" />
        <path d="M9 8V2M15 8V2" />
        <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
      </>
    }
  />
);

export const IconBookCheck = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H19a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H6.5a1 1 0 0 1 0-5H20" />
        <path d="m9 9.5 2 2 4-4" />
      </>
    }
  />
);

export const IconWallet = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
        <path d="M16 12h.01" />
      </>
    }
  />
);

export const IconLifeBuoy = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="4" />
        <line x1="4.93" y1="4.93" x2="9.17" y2="9.17" />
        <line x1="14.83" y1="14.83" x2="19.07" y2="19.07" />
        <line x1="14.83" y1="9.17" x2="19.07" y2="4.93" />
        <line x1="4.93" y1="19.07" x2="9.17" y2="14.83" />
      </>
    }
  />
);

export const IconPauseCircle = (p: IconProps) => (
  <Icon
    {...p}
    d={
      <>
        <circle cx="12" cy="12" r="10" />
        <line x1="10" y1="15" x2="10" y2="9" />
        <line x1="14" y1="15" x2="14" y2="9" />
      </>
    }
  />
);
