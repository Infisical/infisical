import { useLayoutEffect, useRef, useState } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@infisical/cipher/ui/hover-card";
import { Icon } from "@infisical/cipher/ui/icon";

import type { TProjectFolderGrant } from "@app/hooks/api/projectFolderGrants/types";

import styles from "./folder-chips.module.css";

const FolderChip = ({ grant }: { grant: TProjectFolderGrant }) => (
  <Badge tone="soft">
    <span className={styles.env}>{grant.environmentName}</span>
    <Icon name="folder" size={12} />
    <span>{grant.secretPath}</span>
  </Badge>
);

export const FolderChips = ({ grants }: { grants: TProjectFolderGrant[] }) => {
  const fit = useRef<HTMLSpanElement>(null);
  const measure = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(grants.length);
  const signature = grants.map((grant) => grant.id).join("|");

  useLayoutEffect(() => {
    const box = fit.current;
    const ruler = measure.current;
    if (!box || !ruler) return undefined;
    const update = () => {
      const [more, ...items] = [...ruler.children].map(
        (child) => (child as HTMLElement).offsetWidth
      );
      const gap = parseFloat(getComputedStyle(ruler).columnGap) || 0;
      const space = box.clientWidth;
      const total = items.reduce((sum, width) => sum + width + gap, -gap);
      if (total <= space) {
        setShown(items.length);
        return;
      }
      const room = space - more - gap;
      let used = -gap;
      let count = 0;
      while (count < items.length && used + gap + items[count] <= room) {
        used += gap + items[count];
        count += 1;
      }
      setShown(count);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, [signature]);

  const hidden = grants.slice(shown);
  return (
    <span className={styles.root}>
      <span ref={fit} className={styles.chips}>
        {grants.slice(0, shown).map((grant) => (
          <FolderChip key={grant.id} grant={grant} />
        ))}
        {hidden.length > 0 && (
          <HoverCard openDelay={150} closeDelay={100}>
            <HoverCardTrigger asChild>
              <Badge tone="outline" asChild>
                <button type="button" className={styles.more}>{`+${hidden.length} more`}</button>
              </Badge>
            </HoverCardTrigger>
            <HoverCardContent align="start">
              <ul className={styles.list}>
                {hidden.map((grant) => (
                  <li key={grant.id}>
                    <FolderChip grant={grant} />
                  </li>
                ))}
              </ul>
            </HoverCardContent>
          </HoverCard>
        )}
      </span>
      <span ref={measure} className={styles.ruler} aria-hidden="true">
        <Badge tone="outline">{`+${grants.length} more`}</Badge>
        {grants.map((grant) => (
          <FolderChip key={grant.id} grant={grant} />
        ))}
      </span>
    </span>
  );
};
