import { Badge } from "@app/components/v4/ui/badge";
import { Card } from "@app/components/v4/ui/card";
import { Icon } from "@app/components/v4/ui/icon";
import { Grid, Inline, Stack } from "@app/components/v4/ui/layout";
import { PageHeader } from "@app/components/v4/ui/page-header";

import { Shell, useCrumbs } from "./shared";

const products = [
  {
    icon: "key",
    title: "Secrets Management",
    body: "Centralize secrets across environments with automatic secret syncs, secret rotations, short-lived dynamic credentials, and lifecycle policies.",
    stats: [
      ["52", "secrets"],
      ["9", "environments"],
      ["3", "projects"]
    ]
  },
  {
    icon: "cert",
    title: "Certificate Manager",
    body: "Issue, rotate, and govern X.509 certificates for TLS, mTLS, code signing, and device identity.",
    stats: [
      ["0", "certificates"],
      ["0", "CAs"],
      ["0", "signers"]
    ]
  },
  {
    icon: "lock",
    title: "KMS",
    body: "Generate, store, and use cryptographic keys to encrypt, decrypt, sign, and verify against managed CMKs.",
    stats: [
      ["3", "keys"],
      ["0", "clients"],
      ["1", "projects"]
    ]
  },
  {
    icon: "terminal",
    title: "Privileged Access Manager",
    body: "Connect to databases and servers securely with session brokering, recording, and credential vaulting.",
    stats: [
      ["0", "accounts"],
      ["0", "account templates"],
      ["0", "folders"]
    ]
  },
  {
    icon: "agent",
    title: "Agent Vault",
    preview: true,
    body: "Run AI agents with the access, context, and capabilities they need to do work, wherever they operate.",
    stats: [
      ["0", "access bundles"],
      ["0", "services"],
      ["0", "proxies"]
    ]
  }
] as const;

export default function Home() {
  const { org } = useCrumbs();
  return (
    <Shell level="org" current="home" crumbs={[org, { label: "Home" }]}>
      <Stack gap={32}>
        <PageHeader
          title="Organization overview"
          description="Your team's complete security toolkit, organized and ready when you need them."
        />
        <Grid columns={2} gap={32}>
          {products.map((p) => (
            <Card
              key={p.title}
              footerPlacement="frame"
              title={
                <Inline gap={8} align="center">
                  <Icon name={p.icon} size={18} />
                  {p.title}
                  {"preview" in p && <Badge size="sm">Preview</Badge>}
                </Inline>
              }
              description={p.body}
              footer={
                <Inline gap={24}>
                  {p.stats.map(([n, l]) => (
                    <span key={l}>
                      <strong>{n}</strong> {l}
                    </span>
                  ))}
                </Inline>
              }
            />
          ))}
        </Grid>
      </Stack>
    </Shell>
  );
}
