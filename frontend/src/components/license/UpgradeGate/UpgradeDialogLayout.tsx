import { CSSProperties, ReactNode } from "react";

import { AuthPageBackground } from "@app/components/auth/AuthPageBackground";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v3";

type Props = {
  scopeName: string;
  icon: ReactNode;
  title?: string;
  description: string;
  color?: string;
  onOpenChange: (isOpen: boolean) => void;
  children: ReactNode;
  footer: ReactNode;
};

export const focusUpgradeContinuation = (event: Event) => {
  const action = (event.currentTarget as HTMLElement | null)?.querySelector<HTMLButtonElement>(
    "button[data-upgrade-cta]:not(:disabled)"
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
  color,
  onOpenChange,
  children,
  footer
}: Props) => (
  <Dialog open onOpenChange={onOpenChange}>
    <DialogContent
      onOpenAutoFocus={focusUpgradeContinuation}
      showCloseButton={false}
      height="fixed"
      overlayClassName="z-[70]"
      className="@container z-[70] gap-0 overflow-hidden bg-container p-0 sm:max-w-4xl"
    >
      <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] @min-[48rem]:grid-cols-[minmax(16rem,0.9fr)_minmax(0,1.25fr)] @min-[48rem]:grid-rows-1">
        <aside
          className="product-color relative flex min-h-40 flex-col overflow-hidden bg-container @min-[48rem]:min-h-0"
          style={color ? ({ "--product-color": color } as CSSProperties) : undefined}
        >
          <AuthPageBackground className="text-foreground [&>svg]:-left-[22rem] [&>svg]:size-[40rem] xl:[&>svg]:-left-[22rem] xl:[&>svg]:size-[40rem]" />
          <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-8 py-6 text-center @min-[48rem]:py-12">
            <div aria-hidden="true">{icon}</div>
            <DialogHeader className="mt-6 items-center text-center">
              <p
                className={`${color ? "text-(--product-color-resolved)" : "text-muted"} text-xs font-medium tracking-wide uppercase`}
              >
                {scopeName}
              </p>
              <DialogTitle className={title ? "max-w-xs text-2xl leading-tight" : "sr-only"}>
                {title ?? `Upgrade ${scopeName}`}
              </DialogTitle>
              <DialogDescription className="max-w-xs leading-relaxed">
                {description}
              </DialogDescription>
            </DialogHeader>
          </div>
        </aside>

        <div className="m-2 mt-0 flex min-h-0 min-w-0 flex-col overflow-hidden">
          <DialogBody className="flex flex-col gap-6 p-6">{children}</DialogBody>
          <DialogFooter className="mx-0 mt-0 flex-col items-stretch gap-4 rounded-md border border-border bg-card">
            {footer}
          </DialogFooter>
        </div>
      </div>
    </DialogContent>
  </Dialog>
);
