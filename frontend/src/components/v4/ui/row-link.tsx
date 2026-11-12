import { CipherLink, type CipherLinkProps } from "../lib/link";
import { useStretchedLink } from "../lib/stretched-link";
import { cn } from "../lib/utils";
import { Icon } from "./icon";

import styles from "./row-link.module.css";

function RowLink({
  className,
  disabled,
  chevron = true,
  title,
  children,
  ref,
  ...props
}: CipherLinkProps & {
  disabled?: boolean;
  chevron?: boolean;
}) {
  const off = disabled ?? (props.link as { disabled?: boolean }).disabled;
  useStretchedLink(!off);
  const content = chevron ? (
    <>
      <span className={styles.label}>{children}</span>
      <Icon name="chev-right" className={styles.chevron} data-row-link-chevron="" />
    </>
  ) : (
    children
  );
  if (off)
    return (
      <span
        role="link"
        aria-disabled="true"
        title={title}
        data-slot="row-link"
        data-disabled=""
        data-chevron={chevron || undefined}
        className={cn(styles.rowLink, className)}
      >
        {content}
      </span>
    );
  return (
    <CipherLink
      ref={ref}
      title={title}
      data-slot="row-link"
      data-row-link=""
      data-chevron={chevron || undefined}
      className={cn(styles.rowLink, styles.stretched, className)}
      {...props}
    >
      {content}
    </CipherLink>
  );
}

export { RowLink };
