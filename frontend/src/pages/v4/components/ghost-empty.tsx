import type { ReactNode } from "react";
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@infisical/cipher/ui/empty";
import { Icon, type IconName } from "@infisical/cipher/ui/icon";

import styles from "./ghost-empty.module.css";

const GHOSTS = ["a", "b", "c", "d", "e", "f"];

export const GhostEmpty = ({
  layout,
  icon,
  title,
  action
}: {
  layout: "cards" | "rows";
  icon: IconName;
  title: string;
  action?: ReactNode;
}) => (
  <div className={styles.root} data-layout={layout}>
    <div className={styles.ghosts} aria-hidden="true">
      {GHOSTS.map((id) => (
        <span key={id} className={styles.ghost} />
      ))}
    </div>
    <Empty size="sm" className={styles.content}>
      <EmptyMedia>
        <Icon name={icon} />
      </EmptyMedia>
      <EmptyHeader>
        <EmptyTitle className={styles.title}>{title}</EmptyTitle>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  </div>
);
