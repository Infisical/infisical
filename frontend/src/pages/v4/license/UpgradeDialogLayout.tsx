import type { ReactNode } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import { SmallText } from "@app/components/v4/ui/text";

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

export const focusUpgradeContinuation = (event: Event) => {
  const action = (event.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>(
    "[data-upgrade-cta]:not(:disabled):not([aria-disabled='true'])"
  );
  if (!action) return;

  event.preventDefault();
  action.focus({ preventScroll: true });
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
      onOpenAutoFocus={(event) => {
        onOpenAutoFocus?.(event);
        if (!event.defaultPrevented) focusUpgradeContinuation(event);
      }}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <DialogHeader>
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex shrink-0">
            {icon}
          </span>
          <div className="flex min-w-0 flex-col">
            <SmallText muted>{scopeName}</SmallText>
            <DialogTitle>{title}</DialogTitle>
          </div>
        </div>
        {description && <DialogDescription>{description}</DialogDescription>}
      </DialogHeader>
      <div className="flex min-w-0 flex-col gap-6">{children}</div>
      <DialogFooter>
        <div className="flex w-full flex-col gap-4">{footer}</div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
