import { type ReactNode, useState } from "react";

import { Badge } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Icon } from "@app/components/v4/ui/icon";
import { SmallText, Heading } from "@app/components/v4/ui/text";
import { Tooltip } from "@app/components/v4/ui/tooltip";

import { Muted } from "../ui";

import css from "./org.module.css";

export const Section = ({
  title,
  description,
  action,
  children
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) => (
  <section className={css.section}>
    <div className={css.sectionHead}>
      <div className={css.sectionCopy}>
        <Heading level={2} size="subsection">
          {title}
        </Heading>
        <SmallText muted>{description}</SmallText>
      </div>
      {action}
    </div>
    {children}
  </section>
);

export const BackButton = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <span className={css.start}>
    <Button variant="ghost" size="sm" icon="chev-left" onClick={onClick}>
      {label}
    </Button>
  </span>
);

export const CopyButton = ({ value, label }: { value: string; label: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip content={copied ? "Copied" : label}>
      <Button
        variant="ghost"
        size="icon-xs"
        icon={copied ? "check" : "copy"}
        iconOnly
        onClick={() => {
          navigator.clipboard?.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        }}
      >
        {label}
      </Button>
    </Tooltip>
  );
};

export const Dash = () => <Muted>-</Muted>;

export const MetadataBadges = ({
  items
}: {
  items: readonly { key: string; value: string }[] | undefined;
}) =>
  items?.length ? (
    <span className={css.metadata}>
      {items.map((item) => (
        <Badge key={`${item.key}=${item.value}`} tone="outline" mono>
          {`${item.key}=${item.value}`}
        </Badge>
      ))}
    </span>
  ) : (
    <Dash />
  );

export const Value = ({ children, mono }: { children: ReactNode; mono?: boolean }) => (
  <span className={mono ? `${css.value} ${css.mono}` : css.value}>{children}</span>
);

export const VerifiedMark = ({ verified }: { verified: boolean }) => (
  <Tooltip content={verified ? "Email has been verified" : "Email has not been verified"}>
    <span
      className={verified ? css.ok : css.bad}
      role="img"
      aria-label={verified ? "Email has been verified" : "Email has not been verified"}
    >
      <Icon name={verified ? "check" : "x"} size={14} />
    </span>
  </Tooltip>
);
