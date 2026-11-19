import { type ReactNode, useState } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Icon } from "@infisical/cipher/ui/icon";
import { Heading } from "@infisical/cipher/ui/text";
import { Tooltip } from "@infisical/cipher/ui/tooltip";

import { copyText } from "../../clipboard";
import { Muted } from "../ui";

import css from "./org.module.css";

export const Section = ({
  title,
  action,
  children
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) => (
  <section className={css.section}>
    <div className={css.sectionHead}>
      <Heading level={2} size="subsection">
        {title}
      </Heading>
      {action}
    </div>
    {children}
  </section>
);

export const CopyButton = ({
  value,
  label,
  failure
}: {
  value: string;
  label: string;
  failure?: string;
}) => {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip content={copied ? "Copied" : label}>
      <Button
        variant="ghost"
        size="icon-xs"
        icon={copied ? "check" : "copy"}
        iconOnly
        onClick={async () => {
          if (!(await copyText(value, failure))) return;
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
