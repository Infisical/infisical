import { useState, useSyncExternalStore } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Icon } from "@infisical/cipher/ui/icon";
import type { SidebarProps } from "@infisical/cipher/ui/sidebar";

import {
  OrgPermissionMemberActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";

import { accessLinks } from "../access/links";
import { useV4Adapter } from "../data/adapters";
import { orgHref } from "../links";

import styles from "./corner.module.css";

type Step = { id: string; label: string; done: boolean; href: string };

const storageKey = (orgId: string, card: string) => `v4-corner-dismissed:${orgId}:${card}`;

const DISMISSED_EVENT = "v4-corner-dismissed";

const subscribeDismissed = (onChange: () => void) => {
  window.addEventListener(DISMISSED_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(DISMISSED_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
};

const useDismissed = (orgId: string, card: string) => {
  const key = storageKey(orgId, card);
  const dismissed = useSyncExternalStore(
    subscribeDismissed,
    () => window.localStorage.getItem(key) === "1"
  );
  return [
    dismissed,
    () => {
      window.localStorage.setItem(key, "1");
      window.dispatchEvent(new Event(DISMISSED_EVENT));
    }
  ] as const;
};

const useCanInvite = (orgId: string) => {
  const { data } = useV4Adapter("access").useOrgPermission({ orgId });
  return Boolean(
    data?.permission.can(OrgPermissionMemberActions.Create, OrgPermissionSubjects.Member)
  );
};

/** The Get started checklist, derived from what the org already holds. Admins only. */
export const useGetStarted = (orgId: string, enabled = true) => {
  const canInvite = useCanInvite(orgId);
  const { data: setup } = useV4Adapter("home").useSetup(orgId, enabled && canInvite);
  const [dismissed, dismiss] = useDismissed(orgId, "get-started");
  const steps: Step[] = setup
    ? [
        {
          id: "project",
          label: "Create a project",
          done: setup.hasProject,
          href: orgHref(orgId, "/projects/secret-management")
        },
        {
          id: "secrets",
          label: "Add secrets",
          done: setup.hasSecrets,
          href: orgHref(orgId, "/projects/secret-management")
        },
        ...(setup.hasReads === null
          ? []
          : [
              {
                id: "app",
                label: "Connect your app",
                done: setup.hasReads,
                href: orgHref(orgId, "/integrations")
              }
            ]),
        {
          id: "team",
          label: "Invite your team",
          done: setup.members > 1,
          href: `${accessLinks.org(orgId)}&action=invite-members`
        }
      ]
    : [];
  const done = steps.filter((step) => step.done).length;
  return {
    steps,
    done,
    next: steps.find((step) => !step.done),
    members: setup?.members,
    canInvite,
    active: canInvite && !dismissed && steps.length > 0 && done < steps.length,
    dismiss
  };
};

type WhatsNew = {
  title: string;
  date: string;
  open: () => void;
  dismiss: () => void;
};

const CardHead = ({
  title,
  meta,
  onDismiss,
  dismissLabel
}: {
  title: string;
  meta?: string;
  onDismiss: () => void;
  dismissLabel: string;
}) => (
  <div className={styles.head}>
    <span className={styles.title}>
      {title}
      {meta && <span className={styles.meta}>{meta}</span>}
    </span>
    <Button
      variant="ghost"
      size="sm"
      icon="x"
      className={styles.close}
      aria-label={dismissLabel}
      onClick={onDismiss}
    />
  </div>
);

const GetStartedCard = ({ getStarted }: { getStarted: ReturnType<typeof useGetStarted> }) => {
  const [open, setOpen] = useState(false);
  const { steps, done, next } = getStarted;
  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} Get started, ${done} of ${steps.length}`}
          onClick={() => setOpen(!open)}
        >
          <span className={styles.title}>
            Get started
            <span className={styles.meta}>{`${done} of ${steps.length}`}</span>
          </span>
          <Icon name="chev-down" size={14} className={styles.chevron} />
        </button>
      </div>
      <div className={styles.progress} aria-hidden>
        {steps.map((step) => (
          <span key={step.id} data-done={step.done || undefined} />
        ))}
      </div>
      {open ? (
        <ul className={styles.steps}>
          {steps.map((step) => (
            <li key={step.id}>
              <a href={step.href} data-done={step.done || undefined}>
                <span className={styles.check} aria-hidden>
                  {step.done && <Icon name="check" size={12} />}
                </span>
                {step.label}
              </a>
            </li>
          ))}
          <li>
            <Button variant="link" underline="hover" size="sm" onClick={getStarted.dismiss}>
              Hide checklist
            </Button>
          </li>
        </ul>
      ) : (
        next && (
          <a href={next.href} className={styles.next}>
            <span>{`Next: ${next.label}`}</span>
            <Icon name="chev-right" size={14} />
          </a>
        )
      )}
    </div>
  );
};

/**
 * One non-blocking card above the sidebar footer: Get started while the checklist is incomplete,
 * then Invite your team while the viewer is the only member, then the latest unread What's new.
 */
export const useCornerCard = (
  orgId: string,
  enabled: boolean,
  whatsNew?: WhatsNew
): Pick<SidebarProps, "footer" | "footerIcon" | "footerLabel"> => {
  const getStarted = useGetStarted(orgId, enabled);
  const [inviteDismissed, dismissInvite] = useDismissed(orgId, "invite");
  if (!enabled) return {};
  if (getStarted.active)
    return {
      footer: <GetStartedCard getStarted={getStarted} />,
      footerIcon: "list-checks",
      footerLabel: "Get started"
    };
  if (getStarted.canInvite && getStarted.members === 1 && !inviteDismissed)
    return {
      footerIcon: "user-plus",
      footerLabel: "Invite your team",
      footer: (
        <div className={styles.card}>
          <CardHead title="Invite your team" onDismiss={dismissInvite} dismissLabel="Dismiss" />
          <a href={`${accessLinks.org(orgId)}&action=invite-members`} className={styles.next}>
            <span>Invite members</span>
            <Icon name="chev-right" size={14} />
          </a>
        </div>
      )
    };
  if (whatsNew)
    return {
      footerIcon: "megaphone",
      footerLabel: "What's new",
      footer: (
        <div className={styles.card}>
          <CardHead
            title="What's new"
            meta={whatsNew.date}
            onDismiss={whatsNew.dismiss}
            dismissLabel="Dismiss announcement"
          />
          <p className={styles.body}>{whatsNew.title}</p>
          <Button variant="link" size="sm" className={styles.read} onClick={whatsNew.open}>
            Read more
          </Button>
        </div>
      )
    };
  return {};
};
