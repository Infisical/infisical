import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import { Heading, Text } from "@app/components/v4/ui/text";

import styles from "../auth.module.css";

type Props = {
  pageTitle: string;
  title: ReactNode;
  description?: ReactNode;
  titleAction?: ReactNode;
  progress?: ReactNode;
  headerAction?: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  children: ReactNode;
};

export const AuthPage = ({
  pageTitle,
  title,
  description,
  titleAction,
  progress,
  headerAction,
  footer,
  wide,
  children
}: Props) => (
  <div className={styles.page}>
    <PageTitle title={pageTitle} />
    <header className={styles.bar}>
      <Link to="/v4/login" className={styles.brand}>
        <span aria-hidden className={styles.mark} />
        Infisical
      </Link>
      {headerAction}
    </header>
    <main className={styles.main}>
      <div className={styles.column} data-width={wide ? "wide" : undefined}>
        {progress}
        <div className={styles.introRow}>
          <div className={styles.intro}>
            <Heading level={1} size="page">
              {title}
            </Heading>
            {description && <Text muted>{description}</Text>}
          </div>
          {titleAction}
        </div>
        {children}
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </main>
  </div>
);
