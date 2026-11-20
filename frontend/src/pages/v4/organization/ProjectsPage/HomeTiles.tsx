import { lazy, Suspense } from "react";
import { Button } from "@infisical/cipher/ui/button";
import { Icon, type IconName } from "@infisical/cipher/ui/icon";

import { ProjectType } from "@app/hooks/api/projects/types";

import { useV4Adapter } from "../../data/adapters";
import { orgHref, v4Path } from "../../links";
import { productOf } from "../../shell/navigation";
import { MetricTile } from "./MetricTile";

import styles from "./ProjectsPage.module.css";

const BleedChart = lazy(() => import("./BleedChart"));

const fullNumber = new Intl.NumberFormat();
const compactNumber = new Intl.NumberFormat(undefined, { notation: "compact" });
const formatCount = (value: number) =>
  (value >= 100_000 ? compactNumber : fullNumber).format(value);

const tileLink = (orgId: string, path: string) => ({
  to: v4Path("/organizations/$orgId/$"),
  params: { orgId, _splat: path }
});

const SetupAction = ({ href, icon, label }: { href: string; icon: IconName; label: string }) => (
  <Button variant="outline" icon={icon} asChild>
    <a href={href}>{label}</a>
  </Button>
);

const ReadsTile = ({ orgId }: { orgId: string }) => {
  const reads = useV4Adapter("home").useSecretReads(orgId);
  const product = productOf(ProjectType.SecretManager);
  const total = reads.data?.total ?? 0;
  const shared = {
    label: "Secret reads",
    link: tileLink(orgId, "projects/secret-management/insights"),
    hue: product.hue,
    seed: product.type,
    loading: reads.isPending
  };
  if (!total && !reads.isPending)
    return (
      <MetricTile
        {...shared}
        muted
        value="No reads yet"
        note="Reads appear once an app or machine fetches a secret."
        action={
          <SetupAction
            href={orgHref(orgId, "/integrations")}
            icon="terminal"
            label="Connect your app"
          />
        }
      />
    );
  return (
    <MetricTile
      {...shared}
      value={formatCount(total)}
      note="Last 7 days"
      chart={
        reads.data && (
          <Suspense fallback={null}>
            <BleedChart days={reads.data.days} label="Secret reads" />
          </Suspense>
        )
      }
    />
  );
};

const FindingsTile = ({ orgId }: { orgId: string }) => {
  const findings = useV4Adapter("home").useFindings(orgId);
  const product = productOf(ProjectType.SecretScanning);
  const shared = {
    label: "Secret scanning findings",
    link: tileLink(orgId, "secret-scanning/findings"),
    hue: product.hue,
    seed: product.type,
    loading: findings.isPending
  };
  if (!findings.data)
    return (
      <MetricTile
        {...shared}
        muted={!findings.isPending}
        value="Not set up"
        note="Find leaked secrets in your repositories."
        action={
          <SetupAction
            href={orgHref(orgId, "/secret-scanning/data-sources")}
            icon="scan-key"
            label="Connect a repository"
          />
        }
      />
    );
  const { dataSources } = findings.data;
  return (
    <MetricTile
      {...shared}
      value={formatCount(findings.data.findings)}
      note={`Across ${formatCount(dataSources)} data ${dataSources === 1 ? "source" : "sources"}`}
      footer={
        <a href={orgHref(orgId, "/secret-scanning/findings")}>
          Review findings
          <Icon name="chev-right" size={14} />
        </a>
      }
    />
  );
};

const ExpiringTile = ({ orgId }: { orgId: string }) => {
  const expiring = useV4Adapter("home").useExpiringCertificates(orgId);
  const product = productOf(ProjectType.CertificateManager);
  const shared = {
    label: "Certificates expiring",
    link: tileLink(orgId, "cert-manager/inventory"),
    hue: product.hue,
    seed: product.type,
    loading: expiring.isPending
  };
  if (!expiring.data)
    return (
      <MetricTile
        {...shared}
        muted={!expiring.isPending}
        value="Not set up"
        note="Issue and renew TLS certificates from a private CA or an ACME issuer."
        action={
          <SetupAction
            href={orgHref(orgId, "/cert-manager/overview")}
            icon="cert"
            label="Set up certificates"
          />
        }
      />
    );
  return (
    <MetricTile
      {...shared}
      value={formatCount(expiring.data.count)}
      note="In the next 30 days"
      chart={
        <Suspense fallback={null}>
          <BleedChart days={expiring.data.days} label="Certificates expiring" step />
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
