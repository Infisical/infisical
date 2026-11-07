import { type ReactNode, useRef } from "react";
import { Link } from "@tanstack/react-router";

import { PageTitle } from "@app/components/PageTitle";
import { Button } from "@app/components/v4/ui/button";
import { Heading, Text } from "@app/components/v4/ui/text";

import { v4Path } from "../../links";
import { AuthCellField } from "./AuthCellField";

import styles from "../auth.module.css";

type Props = {
  pageTitle: string;
  title: ReactNode;
  description?: ReactNode;
  titleAction?: ReactNode;
  progress?: ReactNode;
  footer?: ReactNode;
  bottom?: ReactNode;
  variant?: "split" | "focused";
  wide?: boolean;
  children: ReactNode;
};

export const AuthPage = ({
  pageTitle,
  title,
  description,
  titleAction,
  progress,
  footer,
  bottom,
  variant = "split",
  wide,
  children
}: Props) => {
  const copyRef = useRef<HTMLDivElement>(null);
  return (
    <div className={styles.page} data-variant={variant}>
      <PageTitle title={pageTitle} />
      <section className={styles.formColumn}>
        <header className={styles.bar}>
          <Link to={v4Path("/login")} className={styles.brand} aria-label="Infisical">
            <span aria-hidden className={styles.mark} />
          </Link>
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
        {bottom && <div className={styles.bottom}>{bottom}</div>}
      </section>
      {variant === "split" && (
        <aside className={styles.aside}>
          <AuthCellField copyRef={copyRef} />
          <div className={styles.asideBar}>
            <Button asChild variant="outline" size="sm" icon="file">
              <a href="https://infisical.com/docs" target="_blank" rel="noopener noreferrer">
                Documentation
              </a>
            </Button>
          </div>
          <div className={styles.pitch}>
            <div ref={copyRef} className={styles.pitchCopy}>
              <span className={styles.eyebrow}>Trusted by 400,000+ developers</span>
              <h2 className={styles.headline}>
                <span>
                  Security <mark className={styles.highlight}>infrastructure</mark>
                </span>
                <span>for developers and agents</span>
              </h2>
              <Text muted>One place to audit every credential your apps and agents use.</Text>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
};
