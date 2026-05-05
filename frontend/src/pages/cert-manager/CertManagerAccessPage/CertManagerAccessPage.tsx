import { Helmet } from "react-helmet";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";

import { EmptyState, PageHeader, Spinner, Tab, TabList, TabPanel, Tabs } from "@app/components/v2";
import { useOrganization } from "@app/context";
import { useGetOrgUsers } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";

const CERT_MANAGER_ORG_ROLES = new Set<string>([
  "cert-manager-admin",
  "cert-manager-guest",
  "admin"
]);

const roleLabel = (role: string) => {
  if (role === "cert-manager-admin") return "Admin";
  if (role === "cert-manager-guest") return "Member";
  if (role === "admin") return "Admin (org)";
  if (role === "custom") return "Member";
  return role;
};

export const CertManagerAccessPage = () => {
  const { orgId, projectId } = useParams({ strict: false });
  const search = useSearch({ strict: false }) as { selectedTab?: string };
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { data: orgUsers, isPending } = useGetOrgUsers(currentOrg?.id ?? "");

  const selectedTab = search.selectedTab ?? "users";

  const certManagerUsers = (orgUsers ?? []).filter((u) =>
    CERT_MANAGER_ORG_ROLES.has(u.role as string)
  );

  const renderUsersPanel = () => {
    if (isPending) {
      return (
        <div className="flex items-center justify-center p-6">
          <Spinner />
        </div>
      );
    }
    if (certManagerUsers.length === 0) {
      return (
        <EmptyState title="No members yet">
          Assign the <span className="font-mono">cert-manager-admin</span> or{" "}
          <span className="font-mono">cert-manager-guest</span> role to an org member from Org
          Access Control.
        </EmptyState>
      );
    }
    return (
      <table className="w-full text-left text-sm text-mineshaft-200">
        <thead className="border-b border-mineshaft-600 text-mineshaft-300">
          <tr>
            <th className="py-2">Name</th>
            <th className="py-2">Email</th>
            <th className="py-2 text-right">Role</th>
          </tr>
        </thead>
        <tbody>
          {certManagerUsers.map((u) => (
            <tr key={u.id} className="border-b border-mineshaft-700 last:border-0">
              <td className="py-3">
                <div className="font-medium">
                  {u.user.firstName} {u.user.lastName}
                </div>
                <div className="font-mono text-xs text-mineshaft-400">{u.user.username}</div>
              </td>
              <td className="py-3 text-mineshaft-300">{u.user.email ?? u.inviteEmail ?? "—"}</td>
              <td className="py-3 text-right">
                <span
                  className={`rounded px-2 py-1 text-xs ${
                    (u.role as string) === "cert-manager-admin" || u.role === "admin"
                      ? "bg-green-700/40 text-green-300"
                      : "bg-mineshaft-700 text-mineshaft-200"
                  }`}
                >
                  {roleLabel(u.role)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  };

  return (
    <>
      <Helmet>
        <title>Access Control</title>
      </Helmet>
      <div className="h-full bg-bunker-800">
        <div className="mx-auto flex flex-col text-white">
          <div className="mx-auto mb-6 w-full max-w-8xl">
            <PageHeader
              scope={ProjectType.CertificateManager}
              title="Access Control"
              description="Admins can manage Settings, CAs, Profiles, and create Applications. Admins of an Application — and access to issued certificates — are managed inside each Application's Access Control."
            />

            <Tabs
              value={selectedTab}
              onValueChange={(v) =>
                navigate({
                  to: `/organizations/${orgId ?? ""}/projects/cert-manager/${projectId ?? ""}/cert-manager-access`,
                  search: { selectedTab: v } as never
                } as never)
              }
            >
              <TabList>
                <Tab variant="project" value="users">
                  Users
                </Tab>
                <Tab variant="project" value="groups">
                  Groups
                </Tab>
                <Tab variant="project" value="identities">
                  Machine Identities
                </Tab>
              </TabList>

              <TabPanel value="users">
                <div className="rounded-md border border-mineshaft-600 bg-mineshaft-900 p-4">
                  <h3 className="mb-3 text-base font-medium text-mineshaft-100">Users</h3>
                  {renderUsersPanel()}
                </div>
              </TabPanel>
              <TabPanel value="groups">
                <div className="rounded-md border border-mineshaft-600 bg-mineshaft-900 p-4 text-sm text-mineshaft-300">
                  Groups assigned the cert-manager-admin or cert-manager-guest org role appear here.
                  Application-level group memberships live inside each Application&apos;s Access
                  Control tab.
                </div>
              </TabPanel>
              <TabPanel value="identities">
                <div className="rounded-md border border-mineshaft-600 bg-mineshaft-900 p-4 text-sm text-mineshaft-300">
                  Machine identities assigned the cert-manager-admin role appear here. These
                  identities can manage the Cert Manager surface programmatically.
                </div>
              </TabPanel>
            </Tabs>
          </div>
        </div>
      </div>
    </>
  );
};
