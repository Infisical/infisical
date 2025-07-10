import { Fragment } from "react";
import { Helmet } from "react-helmet";
import {
  faArrowRightArrowLeft,
  faArrowUpRightFromSquare,
  faBook,
  faClock,
  faCode,
  faCopy,
  faExpand,
  faRotate,
  faSearch,
  faServer,
  faShield,
  faTerminal,
  faUser,
  faUserGroup,
  faWarning
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { createNotification } from "@app/components/notifications";
import { ContentLoader, IconButton, PageHeader } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useGetProjectOverview } from "@app/hooks/api/dashboard/queries";
import { ProductCard } from "@app/pages/project/OverviewPage/components/ProductCard";

const DocLinks = [
  {
    label: "API Docs",
    description: "API endpoints, authentication, and examples",
    icon: faBook,
    link: "https://infisical.com/docs/api-reference/overview/introduction"
  },
  {
    label: "Access Control",
    description: "Manage user permissions and resource-level security",
    icon: faShield,
    link: "https://infisical.com/docs/documentation/platform/access-controls/overview"
  },
  {
    label: "CLI",
    description: "Install, configure, and use command-line tools",
    icon: faTerminal,
    link: "https://infisical.com/docs/cli/overview"
  },
  {
    label: "SDKs",
    description: "Libraries and SDKs for popular programming languages",
    icon: faCode,
    link: "https://infisical.com/docs/sdks/overview"
  },
  {
    label: "Machine Identities",
    description: "Configure service accounts for automated workflows",
    icon: faServer,
    link: "https://infisical.com/docs/documentation/platform/identities/machine-identities#machine-identities"
  },
  {
    label: "Secret Syncs",
    description: "Automatically sync secrets to external platforms",
    icon: faArrowRightArrowLeft,
    link: "https://infisical.com/docs/integrations/secret-syncs/overview"
  },
  {
    label: "Secret Scanning",
    description: "Detect and prevent secret exposure in code",
    icon: faExpand,
    link: "https://infisical.com/docs/documentation/platform/secret-scanning/overview"
  },
  {
    label: "Secret Rotation",
    description: "Automate periodic secret updates and rotation",
    icon: faRotate,
    link: "https://infisical.com/docs/documentation/platform/secret-rotation/overview"
  }
];

export const OverviewPage = () => {
  const { currentWorkspace } = useWorkspace();

  const {
    data: overview = {
      accessControl: { userCount: 0, machineIdentityCount: 0, groupCount: 0 },
      secretsManagement: { secretCount: 0, environmentCount: 0, pendingApprovalCount: 0 },
      certificateManagement: {
        internalCaCount: 0,
        externalCaCount: 0,
        expiryCount: 0
      },
      ssh: { hostCount: 0, hostGroupCount: 0 },
      kms: { keyCount: 0, kmipClientCount: 0 },
      secretScanning: {
        dataSourceCount: 0,
        resourceCount: 0,
        findingCount: 0
      }
    },
    isPending
  } = useGetProjectOverview({
    projectId: currentWorkspace.id,
    projectSlug: currentWorkspace.slug
  });

  if (isPending) return <ContentLoader />;

  const { secretsManagement, certificateManagement, kms, ssh, secretScanning } = overview;

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden bg-bunker-800 p-4 pt-8">
      <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
        <Helmet>
          <title>Project Overview | {currentWorkspace.name}</title>
        </Helmet>
        <div className="flex w-full max-w-7xl flex-col justify-evenly">
          <PageHeader
            title={
              <div>
                <span>{currentWorkspace.name}</span>
                <div className="flex w-full flex-wrap items-center gap-2 text-xs font-normal">
                  <div className="flex items-center gap-1 normal-case text-mineshaft-300">
                    <span>Project Slug: {currentWorkspace.slug}</span>
                    <IconButton
                      onClick={() => {
                        navigator.clipboard.writeText(currentWorkspace.slug);
                        createNotification({
                          text: "Project slug copied to clipboard",
                          type: "info"
                        });
                      }}
                      variant="plain"
                      size="xs"
                      ariaLabel="Copy project ID"
                    >
                      <FontAwesomeIcon className="text-mineshaft-400" icon={faCopy} />
                    </IconButton>
                  </div>
                  <span className="text-mineshaft-400">|</span>
                  <div className="flex items-center gap-1 normal-case text-mineshaft-300">
                    <span>Project ID: {currentWorkspace.id}</span>
                    <IconButton
                      onClick={() => {
                        navigator.clipboard.writeText(currentWorkspace.id);
                        createNotification({
                          text: "Project ID copied to clipboard",
                          type: "info"
                        });
                      }}
                      variant="plain"
                      size="xs"
                      ariaLabel="Copy project ID"
                    >
                      <FontAwesomeIcon className="text-mineshaft-400" icon={faCopy} />
                    </IconButton>
                  </div>
                </div>
              </div>
            }
          >
            <div className="mb-3 mt-auto flex flex-col gap-4 lg:flex-row lg:items-center">
              {[
                { icon: faUser, count: overview.accessControl.userCount, label: "Members" },
                {
                  icon: faServer,
                  count: overview.accessControl.machineIdentityCount,
                  label: "Machine Identities"
                },
                { icon: faUserGroup, count: overview.accessControl.groupCount, label: "Group" }
              ].map(({ icon, count, label }, index) => (
                <Fragment key={`${index + 1}-label`}>
                  <div className="flex items-center gap-1.5 whitespace-nowrap text-sm text-mineshaft-300">
                    <FontAwesomeIcon icon={icon} />
                    <span>{count}</span>
                    <span>{label}</span>
                  </div>
                  <span className="hidden text-sm text-mineshaft-400 last:hidden lg:block">|</span>
                </Fragment>
              ))}
            </div>
          </PageHeader>
          <div className="w-full border-t border-mineshaft-600" />
          <div className="flex flex-col">
            <div className="mt-16">
              <h3 className="mb-4 text-2xl">Products</h3>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                <ProductCard
                  title="Secrets Management"
                  lottie="vault"
                  to="/projects/$projectId/secret-manager/overview"
                  items={[
                    { label: `${secretsManagement.secretCount} Secrets`, key: "secretCount" },
                    {
                      label: `${secretsManagement.environmentCount} Environments`,
                      key: "environmentCount"
                    }
                  ]}
                  badgeProps={
                    secretsManagement.pendingApprovalCount
                      ? {
                          variant: "primary",
                          icon: faClock,
                          label: `${secretsManagement.pendingApprovalCount} Approval${secretsManagement.pendingApprovalCount > 1 ? "s" : ""}`,
                          tooltipContent: `${secretsManagement.pendingApprovalCount} Pending Approval${secretsManagement.pendingApprovalCount > 1 ? "s" : ""}`
                        }
                      : undefined
                  }
                />
                <ProductCard
                  title="Certificate Management"
                  lottie="note"
                  to="/projects/$projectId/cert-manager/subscribers"
                  items={[
                    {
                      label: `${certificateManagement.internalCaCount} Internal CAs`,
                      key: "internalCaCount"
                    },
                    {
                      label: `${certificateManagement.externalCaCount} External CAs`,
                      key: "externalCaCount"
                    }
                  ]}
                  badgeProps={
                    certificateManagement.expiryCount
                      ? {
                          variant: "primary",
                          icon: faWarning,
                          label: `${certificateManagement.expiryCount} Expiring`,
                          tooltipContent: `${certificateManagement.expiryCount} Certificate${certificateManagement.expiryCount > 1 ? "s" : ""} Are About To Expire`
                        }
                      : undefined
                  }
                />
                <ProductCard
                  title="KMS"
                  lottie="unlock"
                  to="/projects/$projectId/kms/overview"
                  items={[
                    { label: `${kms.keyCount} Keys`, key: "keyCount" },
                    {
                      label: `${kms.kmipClientCount} KMIP Clients`,
                      key: "kmipClientCount"
                    }
                  ]}
                />
                <ProductCard
                  title="SSH"
                  lottie="terminal"
                  to="/projects/$projectId/ssh/overview"
                  items={[
                    { label: `${ssh.hostCount} Hosts`, key: "hostCount" },
                    {
                      label: `${ssh.hostGroupCount} Host Groups`,
                      key: "hostGroupCount"
                    }
                  ]}
                />
                <ProductCard
                  title="Secret Scanning"
                  lottie="secret-scan"
                  to="/projects/$projectId/secret-scanning/data-sources"
                  items={[
                    {
                      label: `${secretScanning.dataSourceCount} Data Sources`,
                      key: "dataSourceCount"
                    },
                    {
                      label: `${secretScanning.resourceCount} Resource`,
                      key: "resourceCount"
                    }
                  ]}
                  badgeProps={
                    secretScanning.findingCount
                      ? {
                          variant: "primary",
                          icon: faSearch,
                          label: `${secretScanning.findingCount} Finding${secretScanning.findingCount > 1 ? "s" : ""}`,
                          tooltipContent: `${secretScanning.findingCount} Unresolved Finding${secretScanning.findingCount > 1 ? "s" : ""}`
                        }
                      : undefined
                  }
                />
              </div>
            </div>
            <div className="mt-20">
              <h3 className="mb-4 text-xl">Documentation</h3>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                {DocLinks.map(({ label, description, icon, link }) => (
                  <a
                    key={label}
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded border border-mineshaft-600 bg-mineshaft-800 p-4 transition-transform duration-100 hover:scale-[103%] hover:bg-mineshaft-700"
                  >
                    <div className="w-full items-start">
                      <div className="flex w-full items-center">
                        <FontAwesomeIcon className="mr-2 text-bunker-200" icon={icon} />
                        <span>{label}</span>
                        <FontAwesomeIcon
                          className="ml-auto text-bunker-400"
                          size="sm"
                          icon={faArrowUpRightFromSquare}
                        />
                      </div>
                      <div>
                        <p className="text-sm text-bunker-300">{description}</p>
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
