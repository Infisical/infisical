import { Button } from "@infisical/cipher/ui/button";
import { Icon, type IconName } from "@infisical/cipher/ui/icon";
import { Input } from "@infisical/cipher/ui/input";
import { SmallText } from "@infisical/cipher/ui/text";

import { toast } from "../access/toast";

import styles from "./secret-sharing.module.css";

const publicLink = (path: string, subOrganization?: string) => {
  const url = new URL(`${window.location.origin}${path}`);
  if (subOrganization) url.searchParams.set("subOrganization", subOrganization);
  return url.toString();
};

export const sharedSecretLink = (id: string, subOrganization?: string) =>
  publicLink(`/shared/secret/${id}`, subOrganization);

export const secretRequestLink = (id: string, subOrganization?: string) =>
  publicLink(`/secret-request/secret/${id}`, subOrganization);

export const writeLink = async (
  value: string,
  copy: { copied: string; blocked?: string } = { copied: "Link copied to clipboard" }
) => {
  try {
    await navigator.clipboard.writeText(value);
    toast({ tone: "ok", title: copy.copied });
  } catch {
    toast({
      tone: copy.blocked ? "neutral" : "bad",
      title: copy.blocked ?? "Could not copy the link. Your browser blocked clipboard access."
    });
  }
};

export const LinkResult = ({
  title,
  description,
  url,
  meta
}: {
  title: string;
  description: string;
  url?: string;
  meta: { icon: IconName; label: string }[];
}) => (
  <div className={styles.result}>
    <span className={styles.resultMark}>
      <Icon name="check-c" size={20} />
    </span>
    <div className={styles.resultTitle}>{title}</div>
    <SmallText muted className={styles.center}>
      {description}
    </SmallText>
    {url && (
      <Input
        readOnly
        mono
        aria-label="Link"
        value={url}
        onFocus={(event) => event.currentTarget.select()}
        trailing={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            iconOnly
            icon="copy"
            onClick={() => writeLink(url)}
          >
            Copy link
          </Button>
        }
      />
    )}
    {meta.length > 0 && (
      <div className={styles.resultMeta}>
        {meta.map((item) => (
          <span key={item.label}>
            <Icon name={item.icon} size={12} />
            {item.label}
          </span>
        ))}
      </div>
    )}
  </div>
);
