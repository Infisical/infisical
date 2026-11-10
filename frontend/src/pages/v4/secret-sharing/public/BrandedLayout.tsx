import type { ReactNode } from "react";

import { PageTitle } from "@app/components/PageTitle";
import { V4Scope } from "@app/components/v4/scope";
import type { TBrandingConfig } from "@app/hooks/api/secretSharing/types";

import { brandTheme, DEFAULT_PRIMARY, DEFAULT_SECONDARY } from "./shared";

import styles from "./public.module.css";

export const BrandedLayout = ({
  config,
  logoUrl,
  pageTitle,
  children
}: {
  config: TBrandingConfig;
  logoUrl: string;
  pageTitle: string;
  children: ReactNode;
}) => {
  const theme = brandTheme(
    config.primaryColor || DEFAULT_PRIMARY,
    config.secondaryColor || config.primaryColor || DEFAULT_SECONDARY
  );
  return (
    <div className={styles.branded} style={theme.page}>
      <PageTitle title={pageTitle} />
      {config.hasLogo && <img src={logoUrl} alt="Logo" className={styles.logo} />}
      <V4Scope
        theme={theme.panelTheme}
        portalContainer={null}
        className={styles.panel}
        style={theme.panel}
      >
        {children}
      </V4Scope>
    </div>
  );
};
