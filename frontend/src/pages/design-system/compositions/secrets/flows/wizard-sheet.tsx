import { type ReactNode, useState } from "react";

import { useV4Theme } from "@app/components/v4/scope";
import { Icon } from "@app/components/v4/ui/icon";
import { Steps } from "@app/components/v4/ui/multi-step";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";

import styles from "./flows.module.css";

export function ProviderLogo({ image, size = 20 }: { image?: string; size?: number }) {
  const theme = useV4Theme();
  const onLight = image?.replace(/\.(png|svg)$/, ".on-light.$1");
  const [failed, setFailed] = useState<string[]>([]);
  const candidates = [theme === "light" ? onLight : undefined, image].filter(
    (entry): entry is string => Boolean(entry) && !failed.includes(entry as string)
  );
  if (!candidates.length) return <Icon name="globe" size={size} />;
  return (
    <img
      src={`/images/integrations/${candidates[0]}`}
      alt=""
      width={size}
      height={size}
      className={styles.logo}
      onError={() => setFailed((current) => [...current, candidates[0]])}
    />
  );
}

export function WizardSheet({
  open,
  wide,
  onRequestClose,
  title,
  description,
  media,
  steps,
  current,
  onStepClick,
  heading,
  subtitle,
  aside,
  footer,
  children
}: {
  open: boolean;
  wide?: boolean;
  onRequestClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  media?: ReactNode;
  steps?: { title: string; summary?: ReactNode }[];
  current?: number;
  onStepClick?: (index: number) => void;
  heading?: string;
  subtitle?: string;
  aside?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onRequestClose();
      }}
    >
      <SheetContent className={styles.wizardSheet} data-wide={wide || undefined}>
        <SheetHeader>
          <div className={styles.titleRow}>
            {media && <span className={styles.titleMedia}>{media}</span>}
            <div className={styles.titleText}>
              <SheetTitle>{title}</SheetTitle>
              {description && <SheetDescription>{description}</SheetDescription>}
            </div>
          </div>
        </SheetHeader>
        {!steps && <SheetBody>{children}</SheetBody>}
        {steps && (
          <SheetBody className={styles.wizardBody}>
            <div className={styles.wizardGrid}>
              <nav className={styles.rail} aria-label="Setup steps">
                <p className={styles.eyebrow}>Setup steps</p>
                <Steps
                  steps={steps}
                  current={current ?? 0}
                  orientation="vertical"
                  onStepClick={onStepClick}
                  label="Setup steps"
                />
              </nav>
              <div className={styles.wizardMain}>
                <div className={styles.stepHead}>
                  <h3 className={styles.stepHeading}>{heading}</h3>
                  <p className={styles.stepSubtitle}>{subtitle}</p>
                </div>
                {children}
              </div>
              {aside && <aside className={styles.wizardAside}>{aside}</aside>}
            </div>
          </SheetBody>
        )}
        {footer && <SheetFooter>{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  );
}
