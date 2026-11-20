import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { hueScope } from "@infisical/cipher/lib/hue";
import { Button } from "@infisical/cipher/ui/button";
import { Icon } from "@infisical/cipher/ui/icon";
import { Item, Media } from "@infisical/cipher/ui/item";
import { Stack } from "@infisical/cipher/ui/layout";
import { Tabs } from "@infisical/cipher/ui/tabs";

import { errorMessage, toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import type { HomeApproval, HomeAttention, HomeQueue } from "../../data/home/contract";
import { productOf } from "../../shell/navigation";

import styles from "./ProjectsPage.module.css";

const QUEUE_BREAKPOINT = 720;
const SHOWN = 5;

const useNarrow = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) =>
      setNarrow(entry.contentRect.width < QUEUE_BREAKPOINT)
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, narrow] as const;
};

const shortDate = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

const age = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)}h`;
  if (minutes < 60 * 24 * 7) return `${Math.round(minutes / 60 / 24)}d`;
  return shortDate.format(new Date(iso));
};

const inline = { p: "span" } as const;

const emphasis = (markdown: string) => (
  <ReactMarkdown components={inline} allowedElements={["p", "strong"]} unwrapDisallowed>
    {markdown}
  </ReactMarkdown>
);

const ProductMedia = ({ type }: { type?: HomeApproval["product"] }) => {
  if (!type) return <Media icon="network" tone="bad" />;
  const product = productOf(type);
  return <Media icon={product.icon} className={styles.hueMedia} {...hueScope(product.hue)} />;
};

const Section = ({
  title,
  count,
  trailing,
  children
}: {
  title: string;
  count?: number;
  trailing?: ReactNode;
  children: ReactNode;
}) => {
  const [open, setOpen] = useState(true);
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <button
          type="button"
          className={styles.sectionToggle}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <Icon name="chev-down" size={16} className={styles.sectionChevron} />
          <h2 className={styles.sectionTitle}>
            {title}
            {count ? <span className={styles.sectionCount}>{count}</span> : null}
          </h2>
        </button>
        {open && trailing}
      </div>
      {open && <Stack gap={8}>{children}</Stack>}
    </section>
  );
};

const AllClear = ({ children }: { children: ReactNode }) => (
  <div className={styles.allClear}>
    <Icon name="check-c" size={16} />
    {children}
  </div>
);

const ApprovalRow = ({ approval, narrow }: { approval: HomeApproval; narrow: boolean }) => {
  const approve = useV4Adapter("home").useApprove();
  const [pending, setPending] = useState(false);
  const onApprove = async () => {
    if (!approval.target) return;
    setPending(true);
    try {
      await approve.mutateAsync(approval.target);
      toast({ tone: "ok", title: "Request approved" });
    } catch (error) {
      toast({
        tone: "bad",
        title: "Couldn't approve the request",
        description: errorMessage(error)
      });
    } finally {
      setPending(false);
    }
  };
  return (
    <Item
      variant="outline"
      media={<ProductMedia type={approval.product} />}
      title={
        <>
          <strong>{approval.subject}</strong>
          {approval.action}
        </>
      }
      titleLines={2}
      description={
        <span className={approval.urgent ? styles.urgent : undefined}>{approval.description}</span>
      }
      meta={age(approval.createdAt)}
      actionsPlacement={narrow ? "below" : "end"}
      actions={
        <>
          {approval.href && (
            <Button variant="outline" asChild>
              <a href={approval.href}>Review</a>
            </Button>
          )}
          {approval.target && (
            <Button variant="primary" loading={pending} onClick={onApprove}>
              Approve
            </Button>
          )}
        </>
      }
    />
  );
};

const AttentionRow = ({ item, narrow }: { item: HomeAttention; narrow: boolean }) => (
  <Item
    variant="outline"
    media={<ProductMedia type={item.product} />}
    title={emphasis(item.title)}
    titleLines={2}
    description={item.description && emphasis(item.description)}
    meta={age(item.createdAt)}
    actionsPlacement={narrow ? "below" : "end"}
    actions={
      item.href ? (
        <Button variant="outline" asChild>
          <a href={item.href}>View</a>
        </Button>
      ) : undefined
    }
  />
);

export const HomeQueues = ({ queue }: { queue: HomeQueue }) => {
  const [ref, narrow] = useNarrow();
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(false);
  const { approvals, attention } = queue;
  const shown = expanded ? approvals : approvals.slice(0, SHOWN);
  return (
    <div ref={ref} className={styles.queues}>
      <Tabs
        variant="segmented"
        label="Show"
        value={filter}
        onChange={setFilter}
        tabs={[
          {
            value: "all",
            label: "All",
            count: approvals.length + attention.length
          },
          {
            value: "assigned",
            label: "Assigned to you",
            count: approvals.length
          }
        ]}
      />
      <Section
        title="Needs your approval"
        count={approvals.length}
        trailing={
          approvals.length > SHOWN && (
            <Button variant="link" onClick={() => setExpanded(!expanded)}>
              {expanded ? "Show fewer" : `Show all ${approvals.length}`}
            </Button>
          )
        }
      >
        {shown.length ? (
          shown.map((approval) => (
            <ApprovalRow key={approval.id} approval={approval} narrow={narrow} />
          ))
        ) : (
          <AllClear>Nothing needs your approval.</AllClear>
        )}
      </Section>
      {filter === "all" && (
        <Section title="Needs attention" count={attention.length}>
          {attention.length ? (
            attention.map((item) => <AttentionRow key={item.id} item={item} narrow={narrow} />)
          ) : (
            <AllClear>Nothing is broken.</AllClear>
          )}
        </Section>
      )}
    </div>
  );
};
