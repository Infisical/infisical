import type { ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from "@app/components/v4/ui/dialog";

import styles from "./upgrade-dialog.module.css";

type Props = {
  scopeName: string;
  icon: ReactNode;
  title: string;
  description?: string;
  onOpenChange: (isOpen: boolean) => void;
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
  children: ReactNode;
  footer: ReactNode;
};

const dots = Array.from({ length: 30 }, (_, index) => ({
  x: 40 + (index % 6) * 16,
  y: 24 + Math.floor(index / 6) * 16
}));

// Focusing the primary action would inherit :focus-visible from a menu or keyboard opener and
// paint its ring before any keyboard use, so the dialog itself takes initial focus.
export const focusUpgradeDialog = (event: Event) => {
  event.preventDefault();
  (event.currentTarget as HTMLElement | null)?.focus({ preventScroll: true });
};

export const UpgradeDialogLayout = ({
  scopeName,
  icon,
  title,
  description,
  onOpenChange,
  onOpenAutoFocus,
  onCloseAutoFocus,
  children,
  footer
}: Props) => (
  <Dialog open onOpenChange={onOpenChange}>
    <DialogContent
      className={styles.content}
      onOpenAutoFocus={(event) => {
        onOpenAutoFocus?.(event);
        if (!event.defaultPrevented) focusUpgradeDialog(event);
      }}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <div className={styles.split}>
        <aside className={styles.aside}>
          <svg className={styles.art} viewBox="0 0 160 120" aria-hidden="true" focusable="false">
            <rect className={styles.artBlock} x="8" y="88" width="24" height="24" />
            {dots.map((dot) => (
              <rect
                key={`${dot.x}-${dot.y}`}
                className={styles.artDot}
                x={dot.x}
                y={dot.y}
                width="4"
                height="4"
              />
            ))}
          </svg>
          <span aria-hidden="true" className={styles.heading}>
            {icon}
          </span>
          <div className={styles.heading}>
            <span className={styles.scope}>{scopeName}</span>
            <DialogTitle className={styles.title}>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </div>
        </aside>
        <div className={styles.main}>
          <div className={styles.body}>{children}</div>
          <div className={styles.footer}>{footer}</div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
);
