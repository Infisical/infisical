import { useEffect, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@app/components/v4/ui/alert-dialog";
import { Badge, Count } from "@app/components/v4/ui/badge";
import { Button } from "@app/components/v4/ui/button";
import { Card } from "@app/components/v4/ui/card";
import { DataTable, type DataTableColumn } from "@app/components/v4/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@app/components/v4/ui/dropdown-menu";
import { EmptyState } from "@app/components/v4/ui/empty";
import { Icon } from "@app/components/v4/ui/icon";
import { Input } from "@app/components/v4/ui/input";
import { Grid, Inline, Stack } from "@app/components/v4/ui/layout";
import { DataList, List, ListRow } from "@app/components/v4/ui/list";
import { PageHeader } from "@app/components/v4/ui/page-header";
import { Select } from "@app/components/v4/ui/select";
import { Tooltip, TooltipProvider } from "@app/components/v4/ui/tooltip";

import { Shell, useCrumbs } from "./shared";

type Status = "active" | "expired" | "revoked" | "renewed";
type Cert = {
  id: string;
  cn: string;
  sans: string[];
  serial: string;
  enrollment: "API" | "EST" | "ACME";
  status: Status;
  issued: string;
  expires: string;
  ca: string;
  profile: "tls-server" | "mtls-client" | "code-signing";
  algorithm: string;
  application?: string;
  autoRenew?: number;
};

const today = new Date("2026-10-22");
const daysLeft = (date: string) => Math.round((new Date(date).getTime() - today.getTime()) / 864e5);
const issuing = "Acme Issuing CA G2";
const root = "Acme Internal Root CA";
const seed: Cert[] = [
  {
    id: "c1",
    cn: "api.acme.dev",
    sans: ["api.acme.dev", "api-internal.acme.dev"],
    serial: "4F:A1:9C:2B:7E:11:D0:E2",
    enrollment: "API",
    status: "active",
    issued: "2026-01-14",
    expires: "2027-01-14",
    ca: issuing,
    profile: "tls-server",
    algorithm: "RSA-2048",
    application: "payments-api",
    autoRenew: 30
  },
  {
    id: "c2",
    cn: "payments.acme.dev",
    sans: ["payments.acme.dev", "checkout.acme.dev", "webhooks.acme.dev"],
    serial: "61:0B:E4:93:5A:C7:28:4D",
    enrollment: "API",
    status: "active",
    issued: "2025-11-04",
    expires: "2026-11-04",
    ca: issuing,
    profile: "tls-server",
    algorithm: "RSA-2048",
    application: "payments-api"
  },
  {
    id: "c3",
    cn: "grpc.platform-core.internal",
    sans: ["grpc.platform-core.internal"],
    serial: "2C:88:F1:06:B3:9E:47:5A",
    enrollment: "EST",
    status: "active",
    issued: "2026-07-31",
    expires: "2026-10-29",
    ca: issuing,
    profile: "mtls-client",
    algorithm: "EC-P256",
    application: "platform-core",
    autoRenew: 7
  },
  {
    id: "c4",
    cn: "dashboard.acme.dev",
    sans: ["dashboard.acme.dev", "app.acme.dev"],
    serial: "7D:3E:20:AF:C4:59:1B:86",
    enrollment: "ACME",
    status: "active",
    issued: "2026-09-02",
    expires: "2026-12-01",
    ca: issuing,
    profile: "tls-server",
    algorithm: "EC-P256",
    application: "web-dashboard",
    autoRenew: 30
  },
  {
    id: "c5",
    cn: "*.edge.acme.dev",
    sans: ["*.edge.acme.dev", "edge.acme.dev"],
    serial: "0A:5F:C2:71:E8:34:99:D3",
    enrollment: "ACME",
    status: "active",
    issued: "2026-08-20",
    expires: "2026-11-18",
    ca: issuing,
    profile: "tls-server",
    algorithm: "EC-P256",
    autoRenew: 30
  },
  {
    id: "c6",
    cn: "kafka-broker-1.platform-core.internal",
    sans: ["kafka-broker-1.platform-core.internal"],
    serial: "93:C0:4A:1E:6B:F2:58:07",
    enrollment: "EST",
    status: "renewed",
    issued: "2025-12-01",
    expires: "2026-12-01",
    ca: issuing,
    profile: "mtls-client",
    algorithm: "RSA-4096",
    application: "platform-core"
  },
  {
    id: "c7",
    cn: "release-signer",
    sans: [],
    serial: "B7:12:6D:E0:43:8A:F9:21",
    enrollment: "API",
    status: "active",
    issued: "2026-03-10",
    expires: "2028-03-10",
    ca: root,
    profile: "code-signing",
    algorithm: "EC-P384"
  },
  {
    id: "c8",
    cn: "vault-agent.acme.dev",
    sans: ["vault-agent.acme.dev"],
    serial: "5E:A9:03:D7:2F:C1:6B:48",
    enrollment: "EST",
    status: "active",
    issued: "2026-06-15",
    expires: "2027-06-15",
    ca: issuing,
    profile: "mtls-client",
    algorithm: "RSA-2048"
  },
  {
    id: "c9",
    cn: "legacy-billing.acme.dev",
    sans: ["legacy-billing.acme.dev"],
    serial: "18:F4:B2:9D:60:E5:3C:7A",
    enrollment: "API",
    status: "revoked",
    issued: "2026-02-01",
    expires: "2027-02-01",
    ca: issuing,
    profile: "tls-server",
    algorithm: "RSA-2048"
  },
  {
    id: "c10",
    cn: "staging.acme.dev",
    sans: ["staging.acme.dev", "staging-api.acme.dev"],
    serial: "C3:7B:55:0E:A2:19:D8:F4",
    enrollment: "ACME",
    status: "expired",
    issued: "2026-07-17",
    expires: "2026-10-15",
    ca: issuing,
    profile: "tls-server",
    algorithm: "EC-P256"
  }
];

const statusBadge: Record<Status, { label: string; tone: "ok" | "bad" | "soft" }> = {
  active: { label: "Active", tone: "ok" },
  expired: { label: "Expired", tone: "bad" },
  revoked: { label: "Revoked", tone: "bad" },
  renewed: { label: "Renewed", tone: "soft" }
};
const StatusBadge = ({ status }: { status: Status }) => (
  <Badge tone={statusBadge[status].tone} dot={status !== "renewed"}>
    {statusBadge[status].label}
  </Badge>
);
const expiresSoon = (cert: Cert) => cert.status === "active" && daysLeft(cert.expires) <= 30;
const ExpiryBadge = ({ cert }: { cert: Cert }) =>
  expiresSoon(cert) ? (
    <Badge size="sm" tone="warn">{`In ${daysLeft(cert.expires)} days`}</Badge>
  ) : null;
const extendedKeyUsage: Record<Cert["profile"], string> = {
  "tls-server": "Server authentication",
  "mtls-client": "Client authentication",
  "code-signing": "Code signing"
};

const views = [
  { value: "all", label: "All certificates" },
  { value: "expiring", label: "Expiring in 30 days" },
  { value: "attention", label: "Expired or revoked" }
];
const optionalColumns = [
  { id: "serial", label: "Serial number" },
  { id: "enrollment", label: "Enrollment" },
  { id: "issued", label: "Issued" },
  { id: "profile", label: "Profile" },
  { id: "algorithm", label: "Algorithm" }
];
const deleteBlock = (cert: Cert) =>
  cert.status === "expired" ? undefined : "Available once it expires";
const revokeBlock = (cert: Cert) => {
  if (cert.status === "revoked") return "Already revoked";
  if (cert.status === "expired") return "Expired certificates need no revocation";
  return undefined;
};
const renewBlock = (cert: Cert) =>
  cert.status === "active" ? undefined : "Only active certificates renew";

const CertificateActions = ({
  cert,
  onOpen,
  onRevoke
}: {
  cert: Cert;
  onOpen: () => void;
  onRevoke: () => void;
}) => (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon-sm" icon="more" iconOnly>
        {`Actions for ${cert.cn}`}
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onSelect={onOpen}>
        <Icon name="eye" />
        View details
      </DropdownMenuItem>
      <DropdownMenuItem>
        <Icon name="download" />
        Export certificate
      </DropdownMenuItem>
      <DropdownMenuItem disabled={Boolean(renewBlock(cert))} description={renewBlock(cert)}>
        <Icon name="sync" />
        Renew now
      </DropdownMenuItem>
      <DropdownMenuItem>
        <Icon name="link" />
        Manage certificate syncs
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        variant="destructive"
        disabled={Boolean(revokeBlock(cert))}
        description={revokeBlock(cert)}
        onSelect={onRevoke}
      >
        <Icon name="x" />
        Revoke certificate
      </DropdownMenuItem>
      <DropdownMenuItem
        variant="destructive"
        disabled={Boolean(deleteBlock(cert))}
        description={deleteBlock(cert)}
      >
        <Icon name="trash" />
        Delete certificate
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

const Inventory = ({
  certs,
  onOpen,
  onRevoke
}: {
  certs: Cert[];
  onOpen: (id: string) => void;
  onRevoke: (id: string) => void;
}) => {
  const [query, setQuery] = useState("");
  const [view, setView] = useState("all");
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [hidden, setHidden] = useState<string[]>(["issued", "algorithm"]);
  const [sort, setSort] = useState<{ columnId: string; direction: "asc" | "desc" }>({
    columnId: "expires",
    direction: "asc"
  });
  const needle = query.trim().toLowerCase();
  const rows = certs
    .filter(
      (cert) =>
        !needle ||
        [cert.cn, cert.serial, cert.id, ...cert.sans].some((value) =>
          value.toLowerCase().includes(needle)
        )
    )
    .filter((cert) => !statuses.length || statuses.includes(cert.status))
    .filter((cert) => {
      if (view === "expiring") return expiresSoon(cert);
      if (view === "attention") return cert.status === "expired" || cert.status === "revoked";
      return true;
    })
    .sort((a, b) => {
      const key = sort.columnId === "cn" ? "cn" : "expires";
      return a[key].localeCompare(b[key]) * (sort.direction === "asc" ? 1 : -1);
    });
  const filtered = Boolean(needle) || statuses.length > 0 || view !== "all";
  const expiring = certs.filter(expiresSoon).length;
  const expired = certs.filter((cert) => cert.status === "expired").length;
  const columns: DataTableColumn<Cert>[] = [
    {
      id: "cn",
      header: "SAN / CN",
      primary: true,
      sortable: true,
      grow: true,
      text: (r) => r.cn,
      render: (r) => (
        <Inline gap={8} align="center" wrap={false}>
          <Button variant="link" onClick={() => onOpen(r.id)}>
            {r.cn}
          </Button>
          {r.sans.length > 1 && <Badge size="sm" tone="outline">{`+${r.sans.length - 1}`}</Badge>}
        </Inline>
      )
    },
    {
      id: "serial",
      header: "Serial number",
      width: 128,
      text: (r) => r.serial,
      render: (r) => <code>{`${r.serial.slice(0, 5)}…${r.serial.slice(-5)}`}</code>
    },
    { id: "enrollment", header: "Enrollment", width: 96, render: (r) => r.enrollment },
    {
      id: "status",
      header: "Status",
      width: 112,
      render: (r) => <StatusBadge status={r.status} />
    },
    { id: "issued", header: "Issued", width: 112, render: (r) => r.issued },
    {
      id: "expires",
      header: "Expires",
      sortable: true,
      width: 184,
      render: (r) => (
        <Inline gap={8} align="center" wrap={false}>
          {r.expires}
          <ExpiryBadge cert={r} />
        </Inline>
      )
    },
    { id: "ca", header: "CA", width: 176, text: (r) => r.ca, render: (r) => r.ca },
    { id: "profile", header: "Profile", width: 128, render: (r) => <code>{r.profile}</code> },
    { id: "algorithm", header: "Algorithm", width: 104, render: (r) => r.algorithm },
    {
      id: "actions",
      header: "Actions",
      actions: true,
      render: (r) => (
        <CertificateActions cert={r} onOpen={() => onOpen(r.id)} onRevoke={() => onRevoke(r.id)} />
      )
    }
  ];
  const clear = () => {
    setQuery("");
    setStatuses([]);
    setView("all");
  };
  return (
    <Stack gap={24}>
      <PageHeader
        title="Inventory"
        description={`${expiring} certificates expire within 30 days and ${expired} has expired.`}
        actions={
          <Button variant="outline" icon="upload">
            Import
          </Button>
        }
      />
      <Inline gap={8}>
        <div style={{ flex: 1 }}>
          <Input
            icon="search"
            aria-label="Search certificates"
            placeholder="Search by SAN, CN, ID or serial number"
            kbd="/"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div style={{ width: 208 }}>
          <Select aria-label="View" options={views} value={view} onChange={setView} />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" icon="menu">
              Status
              {statuses.length > 0 && (
                <Count tone="neutral" aria-label={`${statuses.length} statuses selected`}>
                  {statuses.length}
                </Count>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            {(Object.keys(statusBadge) as Status[]).map((status) => (
              <DropdownMenuCheckboxItem
                key={status}
                checked={statuses.includes(status)}
                onCheckedChange={(checked) =>
                  setStatuses((current) =>
                    checked ? [...current, status] : current.filter((s) => s !== status)
                  )
                }
              >
                {statusBadge[status].label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <TooltipProvider>
          <DropdownMenu>
            <Tooltip content="Columns" side="bottom">
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" icon="sidebar" iconOnly>
                  Columns
                </Button>
              </DropdownMenuTrigger>
            </Tooltip>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Columns</DropdownMenuLabel>
              {optionalColumns.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={!hidden.includes(column.id)}
                  onCheckedChange={(checked) =>
                    setHidden((current) =>
                      checked ? current.filter((id) => id !== column.id) : [...current, column.id]
                    )
                  }
                >
                  {column.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Tooltip content="Export CSV" side="bottom">
            <Button variant="outline" size="icon" icon="download" iconOnly disabled={!rows.length}>
              Export CSV
            </Button>
          </Tooltip>
        </TooltipProvider>
      </Inline>
      <DataTable
        label="Certificates in internal-pki"
        rows={rows}
        columns={columns.filter((column) => !hidden.includes(column.id))}
        getRowId={(r) => r.id}
        rowLabel={(r) => r.cn}
        sort={sort}
        onSortChange={setSort}
        empty={
          <EmptyState
            size="sm"
            icon="search"
            title="No certificates match"
            description="Try another search, view or status."
            actions={
              <Button variant="link" onClick={clear}>
                Clear filters
              </Button>
            }
          />
        }
        footer={
          filtered
            ? `${rows.length} of ${certs.length} certificates`
            : `${certs.length} certificates from 2 certificate authorities`
        }
      />
    </Stack>
  );
};

const installations = [
  { id: "lb", title: "lb-prod-1", description: "10.0.4.12:443", meta: "Seen 2 hours ago" },
  {
    id: "ingress",
    title: "ingress-nginx",
    description: "Kubernetes, prod-us-east",
    meta: "Seen 5 hours ago"
  }
];
const ledeOf = (cert: Cert) => {
  const left = daysLeft(cert.expires);
  if (cert.status === "revoked") return "Revoked. Clients that check revocation reject it.";
  if (cert.status === "expired")
    return `Expired ${-left} days ago. Issue a replacement, then delete this one.`;
  if (cert.status === "renewed") return "Renewed. A newer certificate replaces this one.";
  if (left > 30) return `Valid for ${left} more days.`;
  return cert.autoRenew
    ? `Expires in ${left} days. Auto renewal runs ${cert.autoRenew} days before expiry.`
    : `Expires in ${left} days, and auto renewal is off.`;
};

const CertificateDetail = ({
  cert,
  onBack,
  onRevoke
}: {
  cert: Cert;
  onBack: () => void;
  onRevoke: () => void;
}) => {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    const timer = window.setTimeout(() => setLoading(false), 900);
    return () => window.clearTimeout(timer);
  }, [cert.id]);
  const live = cert.status === "active";
  return (
    <Stack gap={24}>
      <PageHeader
        breadcrumb={[
          {
            label: "Inventory",
            href: "#inventory",
            onClick: (event) => {
              event.preventDefault();
              onBack();
            }
          }
        ]}
        title={cert.cn}
        badges={<StatusBadge status={cert.status} />}
        description={ledeOf(cert)}
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" icon="download" iconRight="chev-down">
                  Download
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Certificate (PEM)</DropdownMenuItem>
                <DropdownMenuItem>Certificate and chain (PEM)</DropdownMenuItem>
                <DropdownMenuItem>PKCS#12 bundle</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              icon="x"
              disabled={Boolean(revokeBlock(cert))}
              title={revokeBlock(cert)}
              onClick={onRevoke}
            >
              Revoke
            </Button>
            <Button variant="primary" icon="sync" disabled={!live} title={renewBlock(cert)}>
              Renew now
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" icon="more" iconOnly>
                  More actions
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled={!live} description={renewBlock(cert)}>
                  {cert.autoRenew ? "Manage auto renewal" : "Enable auto renewal"}
                </DropdownMenuItem>
                <DropdownMenuItem>Manage certificate syncs</DropdownMenuItem>
                <DropdownMenuItem>Assign to application</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  disabled={Boolean(deleteBlock(cert))}
                  description={deleteBlock(cert)}
                >
                  Delete certificate
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />
      <Grid columns={3} gap={24} style={{ alignItems: "start" }}>
        <Stack gap={24}>
          <Card title="Overview">
            <DataList
              variant="props"
              items={[
                ["Common name", cert.cn],
                ["Serial number", <code key="serial">{cert.serial}</code>],
                ["Status", <StatusBadge key="status" status={cert.status} />],
                ["Not before", cert.issued],
                [
                  "Not after",
                  <Inline key="after" gap={8} align="center">
                    {cert.expires}
                    <ExpiryBadge cert={cert} />
                  </Inline>
                ],
                ["Source", "Managed"]
              ]}
            />
          </Card>
          <Card title="Issuance">
            <DataList
              variant="props"
              items={[
                [
                  "Certificate authority",
                  <Button key="ca" variant="link">
                    {cert.ca}
                  </Button>
                ],
                ["Profile", <code key="profile">{cert.profile}</code>],
                ["Application", cert.application ?? "None"],
                ["Enrollment", cert.enrollment],
                ["Auto renewal", cert.autoRenew ? `${cert.autoRenew} days before expiry` : "Off"]
              ]}
            />
          </Card>
        </Stack>
        <Stack gap={24} style={{ gridColumn: "span 2" }}>
          <Grid columns={2} gap={24} style={{ alignItems: "start" }}>
            <Card title="Subject">
              <DataList
                variant="props"
                items={[
                  ["Common name", cert.cn],
                  ["Organization", "Acme Corp"],
                  ["Organizational unit", "Platform"],
                  ["Locality", "Vancouver"],
                  ["State", "British Columbia"],
                  ["Country", "CA"]
                ]}
              />
            </Card>
            <Card title="Key usage">
              <DataList
                variant="props"
                items={[
                  [
                    "Key usage",
                    cert.profile === "code-signing"
                      ? "Digital signature"
                      : "Digital signature, key encipherment"
                  ],
                  ["Extended key usage", extendedKeyUsage[cert.profile]],
                  ["Basic constraints", "Not a CA"],
                  ["Key algorithm", cert.algorithm],
                  [
                    "Signature algorithm",
                    cert.algorithm.startsWith("RSA") ? "RSA-SHA256" : "ECDSA-SHA384"
                  ]
                ]}
              />
            </Card>
          </Grid>
          <List
            label="Subject alternative names"
            title="Subject alternative names"
            size="sm"
            empty={
              <EmptyState
                size="sm"
                media="bare"
                icon="cert"
                title="No subject alternative names"
                description="This certificate identifies by common name only."
              />
            }
          >
            {cert.sans.map((san) => (
              <ListRow
                key={san}
                value={san}
                label={san}
                title={<code>{san}</code>}
                meta="DNS name"
              />
            ))}
          </List>
          <List label="Certificate chain" title="Certificate chain" size="sm">
            <ListRow
              value="leaf"
              label={cert.cn}
              media={<Icon name="cert" />}
              title={cert.cn}
              meta="This certificate"
            />
            {cert.ca === issuing && (
              <ListRow
                value="intermediate"
                label={issuing}
                media={<Icon name="building" />}
                title={issuing}
                meta="Intermediate, expires 2030-04-01"
              />
            )}
            <ListRow
              value="root"
              label={root}
              media={<Icon name="building" />}
              title={root}
              meta="Root, expires 2036-01-09"
            />
          </List>
          <List
            label="Installations"
            title="Installations"
            size="sm"
            loading={loading}
            loadingRows={2}
            empty={
              <EmptyState
                size="sm"
                media="bare"
                icon="search"
                title="Not found on any host yet"
                description="Discovery scans list the hosts that serve this certificate."
              />
            }
          >
            {(live ? installations : []).map((host) => (
              <ListRow
                key={host.id}
                value={host.id}
                label={host.title}
                media={<Icon name="machine" />}
                title={host.title}
                description={host.description}
                meta={host.meta}
              />
            ))}
          </List>
        </Stack>
      </Grid>
    </Stack>
  );
};

export default function Certificates() {
  const { org, product, project } = useCrumbs({ product: "certs", project: "internal-pki" });
  const [certs, setCerts] = useState(seed);
  const [openId, setOpenId] = useState<string | null>(null);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const open = certs.find((cert) => cert.id === openId);
  const revoking = certs.find((cert) => cert.id === revokeId);
  return (
    <Shell
      level="pki"
      current="inventory"
      product="certs"
      project="internal-pki"
      crumbs={[org, product, project, { label: "Inventory" }]}
      onNavigate={() => setOpenId(null)}
    >
      {open ? (
        <CertificateDetail
          cert={open}
          onBack={() => setOpenId(null)}
          onRevoke={() => setRevokeId(open.id)}
        />
      ) : (
        <Inventory certs={certs} onOpen={setOpenId} onRevoke={setRevokeId} />
      )}
      <AlertDialog open={Boolean(revoking)} onOpenChange={(next) => !next && setRevokeId(null)}>
        <AlertDialogContent tone="danger">
          <AlertDialogHeader>
            <AlertDialogTitle>{`Revoke ${revoking?.cn ?? "certificate"}?`}</AlertDialogTitle>
            <AlertDialogDescription>
              The next CRL lists it, and clients that check revocation reject it. You cannot undo
              this.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                onClick={() =>
                  setCerts((current) =>
                    current.map((cert) =>
                      cert.id === revokeId ? { ...cert, status: "revoked" } : cert
                    )
                  )
                }
              >
                Revoke certificate
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Shell>
  );
}
