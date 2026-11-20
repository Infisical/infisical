import { type ComponentProps, lazy, type ReactNode, Suspense } from "react";
import { hueScope } from "@infisical/cipher/lib/hue";
import { Button } from "@infisical/cipher/ui/button";
import { Halftone } from "@infisical/cipher/ui/halftone";
import { Icon, type IconName } from "@infisical/cipher/ui/icon";
import { StatCard } from "@infisical/cipher/ui/stat-card";

import { ProjectType } from "@app/hooks/api/projects/types";

import { errorMessage } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { orgHref, v4Path } from "../../links";
import { productOf } from "../../shell/navigation";
import { useBlockedProducts } from "../../shell/product-access";

import styles from "./ProjectsPage.module.css";

const StatCardChart = lazy(() => import("./StatCardChart"));

const MetricTile = ({
  hue,
  seed,
  muted,
  value,
  ...props
}: Omit<ComponentProps<typeof StatCard>, "value"> & {
  hue: number;
  seed: string;
  /** The Not set up state: a muted value and a faint gray hover corner. */
  muted?: boolean;
  value?: ReactNode;
}) => (
  <StatCard
    {...hueScope(hue)}
    {...props}
    variant="plain"
    className={styles.tile}
    value={muted ? <span className={styles.mutedValue}>{value}</span> : value}
    backdrop={
      <Halftone
        reveal="hover"
        reach={107}
        depth={0.667}
        width={160}
        height={96}
        seed={seed}
        tone={muted ? "ink" : "hue"}
        intensity={muted ? 0.33 : 1}
      />
    }
  />
);

const fullNumber = new Intl.NumberFormat();
const compactNumber = new Intl.NumberFormat(undefined, { notation: "compact" });
const formatCount = (value: number) =>
  (value >= 100_000 ? compactNumber : fullNumber).format(value);

const SetupAction = ({ href, icon, label }: { href: string; icon: IconName; label: string }) => (
  <Button variant="outline" icon={icon} asChild>
    <a href={href}>{label}</a>
  </Button>
);

const useTile = (orgId: string, type: ProjectType, label: string, path: string) => {
  const product = productOf(type);
  const blocked = useBlockedProducts(orgId).has(type);
  return {
    blocked,
    shared: {
      label,
      link: blocked
        ? undefined
        : { to: v4Path("/organizations/$orgId/$"), params: { orgId, _splat: path } },
      hue: product.hue,
      seed: product.type
    },
    unavailable: (error: unknown) => ({
      error: errorMessage(error) ?? "Couldn't load this number. Refresh to try again."
    }),
    noAccess: `You don't have access to ${product.label}.`
  };
};

const ReadsTile = ({ orgId }: { orgId: string }) => {
  const reads = useV4Adapter("home").useSecretReads(orgId);
  const tile = useTile(
    orgId,
    ProjectType.SecretManager,
    "Secret reads",
    "projects/secret-management/insights"
  );
  const total = reads.data?.total ?? 0;
  const shared = { ...tile.shared, loading: reads.isPending };
  if (reads.error) return <MetricTile {...shared} {...tile.unavailable(reads.error)} />;
  if (!total && !reads.isPending)
    return (
      <MetricTile
        {...shared}
        muted
        value="No reads yet"
        note="Reads appear once an app or machine fetches a secret."
        action={
          !tile.blocked && (
            <SetupAction
              href={orgHref(orgId, "/integrations")}
              icon="terminal"
              label="Connect your app"
            />
          )
        }
      />
    );
  return (
    <MetricTile
      {...shared}
      value={formatCount(total)}
      note="Last 7 days"
      chartPlacement="bleed"
      chart={
        reads.data && (
          <Suspense fallback={null}>
            <StatCardChart data={reads.data.days.map((day) => day.value)} label="Secret reads" />
          </Suspense>
        )
      }
    />
  );
};

const FindingsTile = ({ orgId }: { orgId: string }) => {
  const findings = useV4Adapter("home").useFindings(orgId);
  const tile = useTile(
    orgId,
    ProjectType.SecretScanning,
    "Secret scanning findings",
    "secret-scanning/findings"
  );
  const shared = { ...tile.shared, loading: findings.isPending };
  if (findings.error) return <MetricTile {...shared} {...tile.unavailable(findings.error)} />;
  if (!findings.data)
    return (
      <MetricTile
        {...shared}
        muted={!findings.isPending}
        value={tile.blocked ? "No access" : "Not set up"}
        note={tile.blocked ? tile.noAccess : "Find leaked secrets in your repositories."}
        action={
          !tile.blocked && (
            <SetupAction
              href={orgHref(orgId, "/secret-scanning/data-sources")}
              icon="scan-key"
              label="Connect a repository"
            />
          )
        }
      />
    );
  const { dataSources } = findings.data;
  const note = `Across ${formatCount(dataSources)} data ${dataSources === 1 ? "source" : "sources"}`;
  return (
    <MetricTile
      {...shared}
      value={formatCount(findings.data.findings)}
      note={tile.blocked ? `${note}. ${tile.noAccess}` : note}
      footerPlacement="frame"
      footer={
        tile.blocked ? undefined : (
          <a href={orgHref(orgId, "/secret-scanning/findings")} className={styles.tileFooter}>
            Review findings
            <Icon name="chev-right" size={14} />
          </a>
        )
      }
    />
  );
};

const ExpiringTile = ({ orgId }: { orgId: string }) => {
  const expiring = useV4Adapter("home").useExpiringCertificates(orgId);
  const tile = useTile(
    orgId,
    ProjectType.CertificateManager,
    "Certificates expiring",
    "cert-manager/inventory"
  );
  const shared = { ...tile.shared, loading: expiring.isPending };
  if (expiring.error) return <MetricTile {...shared} {...tile.unavailable(expiring.error)} />;
  if (!expiring.data)
    return (
      <MetricTile
        {...shared}
        muted={!expiring.isPending}
        value={tile.blocked ? "No access" : "Not set up"}
        note={
          tile.blocked
            ? tile.noAccess
            : "Issue and renew TLS certificates from a private CA or an ACME issuer."
        }
        action={
          !tile.blocked && (
            <SetupAction
              href={orgHref(orgId, "/cert-manager/overview")}
              icon="cert"
              label="Set up certificates"
            />
          )
        }
      />
    );
  return (
    <MetricTile
      {...shared}
      value={formatCount(expiring.data.count)}
      note="In the next 30 days"
      chartPlacement="bleed"
      chart={
        <Suspense fallback={null}>
          <StatCardChart
            data={expiring.data.days.map((day) => day.value)}
            label="Certificates expiring"
            curve="step"
          />
        </Suspense>
      }
    />
  );
};

export const HomeTiles = ({ orgId }: { orgId: string }) => {
  const reads = useV4Adapter("home").useSecretReads(orgId);
  const showReads = reads.isPending || reads.data !== null;
  return (
    <div className={styles.tiles} style={{ ["--tiles" as string]: showReads ? 3 : 2 }}>
      {showReads && <ReadsTile orgId={orgId} />}
      <FindingsTile orgId={orgId} />
      <ExpiringTile orgId={orgId} />
    </div>
  );
};
