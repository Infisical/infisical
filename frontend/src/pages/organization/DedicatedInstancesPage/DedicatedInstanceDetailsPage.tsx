import { useState } from "react";
import {
  Button,
  Card,
  FormControl,
  Input,
  Modal,
  ModalContent,
  Select,
  SelectItem,
  Table,
  TableContainer,
  TBody,
  Th,
  THead,
  Tr,
  Td,
  IconButton,
  EmptyState,
  Badge,
  Tooltip,
  Spinner
} from "@app/components/v2";
import {
  faServer,
  faBookOpen,
  faArrowUpRightFromSquare,
  faHome,
  faTerminal,
  faKey,
  faLock,
  faRotateRight,
  faExclamationTriangle,
  faChevronRight
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@app/context/OrganizationContext";
import { apiRequest } from "@app/config/request";

interface DedicatedInstanceDetails {
  id: string;
  orgId: string;
  instanceName: string;
  subdomain: string;
  status: "RUNNING" | "UPGRADING" | "PROVISIONING" | "FAILED";
  version: string;
  versionUpgrades: "Automatic" | "Manual";
  clusterId: string;
  clusterTier: "Development" | "Production";
  clusterSize: string;
  highAvailability: boolean;
  createdAt: string;
  region: string;
  provider: string;
  publicAccess: boolean;
  ipAllowlist: "Enabled" | "Disabled";
}

const fetchInstanceDetails = async (organizationId: string, instanceId: string) => {
  const { data } = await apiRequest.get<DedicatedInstanceDetails>(
    `/api/v1/organizations/${organizationId}/dedicated-instances/${instanceId}`
  );
  return data;
};

export const DedicatedInstanceDetailsPage = () => {
  const { currentOrg } = useOrganization();
  const { instanceId } = useParams({
    from: "/_authenticate/_inject-org-details/_org-layout/organization/dedicated-instances/$instanceId"
  });
  const [isAPILockModalOpen, setIsAPILockModalOpen] = useState(false);
  const [isRevokeTokensModalOpen, setIsRevokeTokensModalOpen] = useState(false);

  const { data: instance, isLoading, error } = useQuery({
    queryKey: ["dedicatedInstance", instanceId],
    queryFn: () => fetchInstanceDetails(currentOrg?.id || "", instanceId || ""),
    enabled: Boolean(currentOrg?.id && instanceId)
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !instance) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          title="Error loading instance details"
          icon={faServer}
        >
          <p className="text-sm text-bunker-400">
            {error instanceof Error ? error.message : "Failed to load instance details"}
          </p>
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col space-y-4 p-4">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-mineshaft-300">
          <Link to="/" className="flex items-center gap-1 hover:text-mineshaft-200">
            <FontAwesomeIcon icon={faHome} />
            <span>Home</span>
          </Link>
          <FontAwesomeIcon icon={faChevronRight} className="text-xs" />
          <Link to="/organization/dedicated-instances" className="hover:text-mineshaft-200">
            Dedicated Instances
          </Link>
          <FontAwesomeIcon icon={faChevronRight} className="text-xs" />
          <span className="text-mineshaft-200">{instance.instanceName}</span>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-mineshaft-100">
              {instance.instanceName} <span className="text-mineshaft-300">({instance.region})</span>
            </h1>
          </div>
          <div>
            <Button
              variant="solid"
              colorSchema="primary"
              leftIcon={<FontAwesomeIcon icon={faArrowUpRightFromSquare} />}
              onClick={() => window.open(`https://${instance.subdomain}.infisical.com`, "_blank")}
            >
              Launch Web UI
            </Button>
          </div>
        </div>

        {instance.publicAccess && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-yellow-500/10 px-4 py-3 text-sm text-yellow-500">
            <FontAwesomeIcon icon={faExclamationTriangle} />
            <p>
              This cluster's network configuration is set to public. Configure an IP Allowlist in the cluster's networking
              settings to limit network access to the cluster's public endpoint.
            </p>
          </div>
        )}
      </div>

      <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="grid grid-cols-2 gap-4">
          <Card className="col-span-1 rounded-lg border border-mineshaft-600 bg-mineshaft-800">
            <div className="p-4">
              <h2 className="mb-4 text-lg font-semibold text-mineshaft-100">Cluster Details</h2>
              <div className="space-y-4">
                <div className="flex justify-between border-b border-mineshaft-700 pb-2">
                  <span className="text-sm text-mineshaft-300">Status</span>
                  <Badge variant={instance.status === "RUNNING" ? "success" : "primary"}>
                    {instance.status}
                  </Badge>
                </div>
                <div className="flex justify-between border-b border-mineshaft-700 pb-2">
                  <span className="text-sm text-mineshaft-300">Vault Version</span>
                  <span className="text-sm font-medium text-mineshaft-100">{instance.version}</span>
                </div>
                <div className="flex justify-between border-b border-mineshaft-700 pb-2">
                  <span className="text-sm text-mineshaft-300">Version upgrades</span>
                  <span className="text-sm font-medium text-mineshaft-100">{instance.versionUpgrades}</span>
                </div>
                <div className="flex justify-between border-b border-mineshaft-700 pb-2">
                  <span className="text-sm text-mineshaft-300">Cluster Size</span>
                  <span className="text-sm font-medium text-mineshaft-100">{instance.clusterSize}</span>
                </div>
                <div className="flex justify-between border-b border-mineshaft-700 pb-2">
                  <span className="text-sm text-mineshaft-300">High Availability</span>
                  <span className="text-sm font-medium text-mineshaft-100">{instance.highAvailability ? "Yes" : "No"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-mineshaft-300">Created</span>
                  <span className="text-sm font-medium text-mineshaft-100">
                    {new Date(instance.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
          </Card>

          <div className="col-span-1 space-y-4">
            <Card className="rounded-lg border border-mineshaft-600 bg-mineshaft-800">
              <div className="p-4">
                <h2 className="mb-4 text-lg font-semibold text-mineshaft-100">Quick actions</h2>
                <div className="grid grid-cols-2 gap-4">
                  <Card className="bg-mineshaft-700 rounded-lg">
                    <div className="p-4">
                      <h3 className="mb-2 text-sm font-medium text-mineshaft-100">How to access via</h3>
                      <div className="flex gap-4">
                        <Button
                          variant="outline"
                          colorSchema="secondary"
                          size="sm"
                          leftIcon={<FontAwesomeIcon icon={faTerminal} />}
                        >
                          Command-line (CLI)
                        </Button>
                        <Button
                          variant="outline"
                          colorSchema="secondary"
                          size="sm"
                          leftIcon={<FontAwesomeIcon icon={faKey} />}
                        >
                          API
                        </Button>
                      </div>
                    </div>
                  </Card>

                  <Card className="bg-mineshaft-700 rounded-lg">
                    <div className="p-4">
                      <h3 className="mb-2 text-sm font-medium text-mineshaft-100">New root token</h3>
                      <Tooltip content="Generate a root token">
                        <Button
                          variant="outline"
                          colorSchema="secondary"
                          size="sm"
                          leftIcon={<FontAwesomeIcon icon={faKey} />}
                        >
                          Generate token
                        </Button>
                      </Tooltip>
                    </div>
                  </Card>
                </div>
              </div>
            </Card>

            <Card className="rounded-lg border border-mineshaft-600 bg-mineshaft-800">
              <div className="p-4">
                <h2 className="mb-4 text-lg font-semibold text-mineshaft-100">Cluster URLs</h2>
                <p className="mb-4 text-sm text-mineshaft-300">Copy the address into your CLI or browser to access the cluster.</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded-lg bg-mineshaft-700 p-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="primary">Private</Badge>
                      <code className="text-sm text-mineshaft-300">https://{instance.subdomain}.infisical.com</code>
                    </div>
                    <Button variant="outline" colorSchema="secondary" size="sm">
                      Copy
                    </Button>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-mineshaft-700 p-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="primary">Public</Badge>
                      <code className="text-sm text-mineshaft-300">https://{instance.subdomain}.infisical.com</code>
                    </div>
                    <Button variant="outline" colorSchema="secondary" size="sm">
                      Copy
                    </Button>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="rounded-lg border border-mineshaft-600 bg-mineshaft-800">
              <div className="p-4">
                <h2 className="mb-4 text-lg font-semibold text-mineshaft-100">Cluster networking</h2>
                <div className="space-y-4">
                  <div className="flex justify-between border-b border-mineshaft-700 pb-2">
                    <span className="text-sm text-mineshaft-300">Provider/region</span>
                    <span className="text-sm font-medium text-mineshaft-100">
                      {instance.provider} ({instance.region})
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-mineshaft-700 pb-2">
                    <span className="text-sm text-mineshaft-300">Cluster accessibility</span>
                    <Badge variant={instance.publicAccess ? "danger" : "success"}>
                      {instance.publicAccess ? "Public" : "Private"}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-mineshaft-300">IP allowlist</span>
                    <span className="text-sm font-medium text-mineshaft-100">{instance.ipAllowlist}</span>
                  </div>
                </div>
              </div>
            </Card>

            <Card className="rounded-lg border border-mineshaft-600 bg-mineshaft-800">
              <div className="p-4">
                <h2 className="mb-4 text-lg font-semibold text-mineshaft-100">In case of emergency</h2>
                <div className="space-y-4">
                  <Button
                    variant="outline"
                    colorSchema="danger"
                    className="w-full"
                    leftIcon={<FontAwesomeIcon icon={faLock} />}
                    onClick={() => setIsAPILockModalOpen(true)}
                  >
                    API Lock
                  </Button>
                  <Button
                    variant="outline"
                    colorSchema="danger"
                    className="w-full"
                    leftIcon={<FontAwesomeIcon icon={faRotateRight} />}
                    onClick={() => setIsRevokeTokensModalOpen(true)}
                  >
                    Revoke all admin tokens
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      <Modal isOpen={isAPILockModalOpen} onOpenChange={setIsAPILockModalOpen}>
        <ModalContent
          title="API Lock"
          subTitle="Are you sure you want to lock the API? This will prevent all API access until unlocked."
        >
          <div className="mt-8 flex justify-end space-x-4">
            <Button
              variant="plain"
              colorSchema="secondary"
              onClick={() => setIsAPILockModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="solid"
              colorSchema="danger"
              onClick={() => {
                // Handle API lock
                setIsAPILockModalOpen(false);
              }}
            >
              Lock API
            </Button>
          </div>
        </ModalContent>
      </Modal>

      <Modal isOpen={isRevokeTokensModalOpen} onOpenChange={setIsRevokeTokensModalOpen}>
        <ModalContent
          title="Revoke Admin Tokens"
          subTitle="Are you sure you want to revoke all admin tokens? This action cannot be undone."
        >
          <div className="mt-8 flex justify-end space-x-4">
            <Button
              variant="plain"
              colorSchema="secondary"
              onClick={() => setIsRevokeTokensModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="solid"
              colorSchema="danger"
              onClick={() => {
                // Handle token revocation
                setIsRevokeTokensModalOpen(false);
              }}
            >
              Revoke Tokens
            </Button>
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
}; 