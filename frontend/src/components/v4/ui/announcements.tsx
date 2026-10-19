import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { exit, snap, spring } from "../lib/motion";
import { useControllableState } from "../lib/use-controllable-state";
import { Button } from "./button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./dialog";

import styles from "./announcements.module.css";

export interface Announcement {
  id: string;
  eyebrow: string;
  title: string;
  description: React.ReactNode;
  media?: React.ReactNode;
  action?: { label: string; href?: string; external?: boolean; onClick?: () => void };
}

export type AnnouncementsProps = {
  items: readonly Announcement[];
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  index?: number;
  defaultIndex?: number;
  onIndexChange?: (index: number) => void;
  onSeen?: (id: string) => void;
  onDone?: () => void;
  loop?: boolean;
  label?: string;
};

const Inert = ({ children }: { children: React.ReactNode }) => (
  <div className={styles.media} aria-hidden="true" ref={(node) => node?.setAttribute("inert", "")}>
    {children}
  </div>
);

export const Announcements = ({
  items,
  open,
  defaultOpen = false,
  onOpenChange,
  index,
  defaultIndex = 0,
  onIndexChange,
  onSeen,
  onDone,
  loop = true,
  label = "What's new"
}: AnnouncementsProps) => {
  const [isOpen, setOpen] = useControllableState({
    value: open,
    defaultValue: defaultOpen,
    onChange: onOpenChange
  });
  const [current, setCurrent] = useControllableState({
    value: index,
    defaultValue: defaultIndex,
    onChange: onIndexChange
  });
  const [direction, setDirection] = React.useState(1);
  const reduced = useReducedMotion();
  const next = React.useRef<HTMLButtonElement | null>(null);
  const item = items[current];
  const last = current === items.length - 1;
  const seen = React.useRef(onSeen);
  seen.current = onSeen;
  const itemId = item?.id;
  React.useEffect(() => {
    if (isOpen && itemId) seen.current?.(itemId);
  }, [isOpen, itemId]);
  const go = (target: number) => {
    const wrapped = loop ? (target + items.length) % items.length : target;
    if (wrapped < 0 || wrapped >= items.length || wrapped === current) return;
    setDirection(target > current ? 1 : -1);
    setCurrent(wrapped);
  };
  if (!item) return null;
  const travel = reduced ? 0 : 24;
  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent
        data-slot="announcements"
        showCloseButton={false}
        aria-roledescription="carousel"
        className={styles.dialog}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          next.current?.focus();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") go(current + 1);
          if (event.key === "ArrowLeft") go(current - 1);
        }}
      >
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <motion.div layout={!reduced} transition={spring.moderate} className={styles.viewport}>
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <motion.div
              key={item.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`${current + 1} of ${items.length}`}
              custom={direction}
              initial={{ opacity: 0, x: direction * travel }}
              animate={{ opacity: 1, x: 0, transition: reduced ? snap : spring.moderate }}
              exit={{
                opacity: 0,
                x: -direction * travel,
                transition: reduced ? snap : exit.moderate
              }}
              className={styles.card}
            >
              {item.media && <Inert>{item.media}</Inert>}
              <div className={styles.copy}>
                <p className={styles.eyebrow}>{item.eyebrow}</p>
                <h3 className={styles.title}>{item.title}</h3>
                <DialogDescription asChild>
                  <div className={styles.description}>{item.description}</div>
                </DialogDescription>
                {item.action &&
                  (item.action.href ? (
                    <Button variant="link" size="sm" asChild className={styles.action}>
                      <a
                        href={item.action.href}
                        target={item.action.external ? "_blank" : undefined}
                        rel={item.action.external ? "noreferrer" : undefined}
                      >
                        {item.action.label}
                      </a>
                    </Button>
                  ) : (
                    <Button
                      variant="link"
                      size="sm"
                      className={styles.action}
                      onClick={item.action.onClick}
                    >
                      {item.action.label}
                    </Button>
                  ))}
              </div>
            </motion.div>
          </AnimatePresence>
        </motion.div>
        <p className="sr-only" aria-live="polite">
          {`${current + 1} of ${items.length}: ${item.title}`}
        </p>
        <div className={styles.footer}>
          <div className={styles.dots}>
            {items.map((entry, position) => (
              <button
                key={entry.id}
                type="button"
                className={styles.dot}
                data-current={position === current || undefined}
                aria-label={`Show ${position + 1} of ${items.length}`}
                aria-current={position === current ? "true" : undefined}
                onClick={() => go(position)}
              />
            ))}
          </div>
          <div className={styles.buttons}>
            <Button
              variant="ghost"
              size="sm"
              disabled={!loop && current === 0}
              onClick={() => go(current - 1)}
            >
              Back
            </Button>
            <Button
              ref={next}
              variant="primary"
              size="sm"
              onClick={() => {
                if (last) {
                  setOpen(false);
                  onDone?.();
                } else go(current + 1);
              }}
            >
              {last ? "Done" : "Next"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
