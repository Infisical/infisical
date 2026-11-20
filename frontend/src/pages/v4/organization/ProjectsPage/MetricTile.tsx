import type { ReactNode } from "react";
import { hueScope } from "@infisical/cipher/lib/hue";
import type { CipherLinkProps } from "@infisical/cipher/lib/link";
import { cn } from "@infisical/cipher/lib/utils";
import { Card, CardLink } from "@infisical/cipher/ui/card";
import { Halftone } from "@infisical/cipher/ui/halftone";
import { Icon } from "@infisical/cipher/ui/icon";
import { Skeleton } from "@infisical/cipher/ui/skeleton";

import styles from "./MetricTile.module.css";

/**
 * Temporary app-local stand-in for a full-bleed StatCard variant (chart slot with
 * chartPlacement="bleed", chartSize, footer and action). Replace it with Cipher's StatCard once
 * the variant ships there.
 */
export const MetricTile = ({
  label,
  link,
  hue,
  seed,
  value,
  note,
  loading,
  muted,
  chart,
  footer,
  action
}: {
  label: string;
  link: CipherLinkProps["link"];
  hue: number;
  seed: string;
  value?: ReactNode;
  note?: ReactNode;
  loading?: boolean;
  /** The Not set up state: a muted value, a setup action and a faint gray hover corner. */
  muted?: boolean;
  chart?: ReactNode;
  footer?: ReactNode;
  action?: ReactNode;
}) => (
  <Card {...hueScope(hue)} flush data-muted={muted || undefined} className={styles.tile}>
    <span className={styles.corner} aria-hidden>
      <Halftone
        reveal="hover"
        reach={107}
        depth={0.667}
        seed={seed}
        tone={muted ? "ink" : "hue"}
        intensity={muted ? 0.33 : 1}
      />
    </span>
    <div className={styles.body}>
      <span className={styles.label}>
        <CardLink link={link}>{label}</CardLink>
        <Icon name="chev-right" size={14} />
      </span>
      {loading ? (
        <Skeleton className={styles.valueSkeleton} />
      ) : (
        <>
          <div className={cn(styles.value, muted && styles.mutedValue)}>{value}</div>
          {note && <p className={styles.note}>{note}</p>}
          {action && <div className={styles.action}>{action}</div>}
        </>
      )}
    </div>
    {!loading && chart && <div className={styles.chart}>{chart}</div>}
    {!loading && footer && <div className={styles.footer}>{footer}</div>}
  </Card>
);
