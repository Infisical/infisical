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
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuContent,
  Table,
  TableContainer,
  TBody,
  Th,
  THead,
  Tr,
  Td,
  IconButton,
  EmptyState,
  FormHelperText,
  Spinner
} from "@app/components/v2";
import {
  faPlus,
  faSearch,
  faServer,
  faEllipsisVertical,
  faBookOpen,
  faArrowUpRightFromSquare,
  faArrowDown,
  faArrowUp,
  faMagnifyingGlass,
  faHome,
  faSpinner
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { twMerge } from "tailwind-merge";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient, useQueries } from "@tanstack/react-query";
import { useOrganization } from "@app/context/OrganizationContext";
import { apiRequest } from "@app/config/request";

interface DedicatedInstance {
  id: string;
  orgId: string;
  instanceName: string;
  subdomain: string;
  status: "RUNNING" | "UPGRADING" | "PROVISIONING" | "FAILED";
  stackStatus?: string;
  stackStatusReason?: string;
  events?: Array<{
    timestamp?: Date;
    logicalResourceId?: string;
    resourceType?: string;
    resourceStatus?: string;
    resourceStatusReason?: string;
  }>;
  rdsInstanceType: string;
  elasticCacheType: string;
  elasticContainerMemory: number;
  elasticContainerCpu: number;
  region: string;
  version: string;
  backupRetentionDays: number;
  lastBackupTime: string | null;
  lastUpgradeTime: string | null;
  publiclyAccessible: boolean;
  vpcId: string | null;
  subnetIds: string[] | null;
  tags: Record<string, string> | null;
  createdAt: string;
  updatedAt: string;
}

const INSTANCE_SIZES = [
  { value: "small", label: "Small (2 vCPU, 8GB RAM)" },
  { value: "medium", label: "Medium (4 vCPU, 16GB RAM)" },
  { value: "large", label: "Large (8 vCPU, 32GB RAM)" }
];

type CloudProvider = "aws" | "gcp" | "azure";

interface CreateInstancePayload {
  instanceName: string;
  subdomain: string;
  region: string;
  provider: "aws";
  publiclyAccessible: boolean;
  clusterSize: "small" | "medium" | "large";
}

const INITIAL_INSTANCE_STATE: CreateInstancePayload = {
  instanceName: "",
  subdomain: "",
  region: "",
  provider: "aws",
  publiclyAccessible: false,
  clusterSize: "small"
};

const PROVIDERS: Array<{
  value: CloudProvider;
  label: string;
  image: string;
  description: string;
}> = [
  { 
    value: "aws", 
    label: "Amazon Web Services",
    image: "/images/integrations/Amazon Web Services.png",
    description: "Deploy your instance on AWS infrastructure"
  },
  { 
    value: "gcp", 
    label: "Google Cloud Platform",
    image: "/images/integrations/Google Cloud Platform.png",
    description: "Deploy your instance on Google Cloud infrastructure"
  },
  { 
    value: "azure", 
    label: "Microsoft Azure",
    image: "/images/integrations/Microsoft Azure.png",
    description: "Deploy your instance on Azure infrastructure"
  }
];

const REGIONS = {
  aws: [
    { value: "us-east-1", label: "US East (N. Virginia)" },
    { value: "us-west-2", label: "US West (Oregon)" },
    { value: "eu-west-1", label: "EU West (Ireland)" },
    { value: "ap-southeast-1", label: "Asia Pacific (Singapore)" }
  ],
  gcp: [
    { value: "us-east1", label: "US East (South Carolina)" },
    { value: "us-west1", label: "US West (Oregon)" },
    { value: "europe-west1", label: "Europe West (Belgium)" },
    { value: "asia-southeast1", label: "Asia Southeast (Singapore)" }
  ],
  azure: [
    { value: "eastus", label: "East US (Virginia)" },
    { value: "westus", label: "West US (California)" },
    { value: "westeurope", label: "West Europe (Netherlands)" },
    { value: "southeastasia", label: "Southeast Asia (Singapore)" }
  ]
};

interface RouteParams {
  organizationId: string;
}

const dedicatedInstanceKeys = {
  getInstances: (organizationId: string) => ["dedicatedInstances", { organizationId }] as const,
  getInstance: (organizationId: string, instanceId: string) => ["dedicatedInstance", { organizationId, instanceId }] as const
};

const getDeploymentStage = (events?: DedicatedInstance['events']) => {
  if (!events?.length) return 'Deploying';
  return 'Deploying';
};

const getDeploymentProgress = (instance: DedicatedInstance) => {
  if (instance.status === 'RUNNING') return { stage: 'Complete', progress: 100 };
  if (instance.status === 'FAILED') return { stage: 'Failed', progress: 0 };
  
  const events = instance.events || [];
  if (events.length === 0) return { stage: 'Deploying', progress: 0 };
  
  // Count completed events vs total events
  const completedEvents = events.filter(event => 
    event.resourceStatus?.includes('COMPLETE') || 
    event.resourceStatus?.includes('CREATE_COMPLETE')
  ).length;
  
  const progress = Math.round((completedEvents / events.length) * 100);
  
  return { stage: 'Deploying', progress };
};

const fetchInstances = async (organizationId: string) => {
  const { data } = await apiRequest.get<{ instances: DedicatedInstance[] }>(
    `/api/v1/organizations/${organizationId}/dedicated-instances`
  );
  return data;
};

const fetchInstanceDetails = async (organizationId: string, instanceId: string) => {
  const { data } = await apiRequest.get<DedicatedInstance>(
    `/api/v1/organizations/${organizationId}/dedicated-instances/${instanceId}`
  );
  return data;
};

const createInstance = async (organizationId: string, data: CreateInstancePayload) => {
  const { data: response } = await apiRequest.post<DedicatedInstance>(
    `/api/v1/organizations/${organizationId}/dedicated-instances`,
    data
  );
  return response;
};

export const DedicatedInstancesPage = () => {
  const { currentOrg } = useOrganization();
  const navigate = useNavigate();
  const organizationId = currentOrg?.id || "";
  const queryClient = useQueryClient();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [newInstance, setNewInstance] = useState(INITIAL_INSTANCE_STATE);

  type InstancesResponse = { instances: DedicatedInstance[] };

  // Fetch all instances
  const { data: instancesData, isLoading, error } = useQuery<InstancesResponse>({
    queryKey: dedicatedInstanceKeys.getInstances(organizationId),
    queryFn: () => fetchInstances(organizationId),
    enabled: Boolean(organizationId),
  });

  // Fetch details for provisioning instances
  const provisioningInstances = instancesData?.instances.filter(
    instance => instance.status === "PROVISIONING"
  ) || [];

  const instanceDetailsQueries = useQueries({
    queries: provisioningInstances.map(instance => ({
      queryKey: dedicatedInstanceKeys.getInstance(organizationId, instance.id),
      queryFn: () => fetchInstanceDetails(organizationId, instance.id),
      refetchInterval: 2000, // Poll every 2 seconds
    }))
  });

  // Merge instance details with the main instances list
  const instances = instancesData?.instances.map(instance => {
    if (instance.status === "PROVISIONING") {
      const detailsQuery = instanceDetailsQueries.find(
        q => q.data?.id === instance.id
      );
      return detailsQuery?.data || instance;
    }
    return instance;
  }) || [];

  // Create instance mutation
  const createInstanceMutation = useMutation({
    mutationFn: (data: CreateInstancePayload) => createInstance(organizationId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: dedicatedInstanceKeys.getInstances(organizationId) });
      setIsCreateModalOpen(false);
      setNewInstance(INITIAL_INSTANCE_STATE);
    }
  });

  const handleCreateInstance = () => {
    createInstanceMutation.mutate(newInstance);
  };

  const handleModalOpenChange = (open: boolean) => {
    setIsCreateModalOpen(open);
    if (!open) {
      setNewInstance(INITIAL_INSTANCE_STATE);
    }
  };

  // Get available regions based on selected provider
  const availableRegions = newInstance.provider ? REGIONS[newInstance.provider] : [];

  // Filter instances based on search term
  const filteredInstances = instances.filter((instance: DedicatedInstance) =>
    instance.instanceName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex h-full flex-col space-y-4 p-4">
      <div className="mb-6">
        <div className="flex items-center gap-2 text-sm text-mineshaft-300">
          <Link to="/" className="flex items-center gap-1 hover:text-mineshaft-200">
            <FontAwesomeIcon icon={faHome} />
            <span>Home</span>
          </Link>
          <span>/</span>
          <span className="text-mineshaft-200">Dedicated Instances</span>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <h1 className="text-3xl font-semibold text-mineshaft-100">Dedicated Instances</h1>
          <a
            href="https://infisical.com/docs/dedicated-instances/overview"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-yellow/20 px-2 py-1 text-sm text-yellow opacity-80 hover:opacity-100"
          >
            <FontAwesomeIcon icon={faBookOpen} className="mr-1.5" />
            <span>Docs</span>
            <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="text-[10px]" />
          </a>
        </div>
        <p className="mt-2 text-base text-mineshaft-300">
          Create and manage dedicated Infisical instances across different regions
        </p>
      </div>

      <div className="w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <div className="flex justify-end mb-4">
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            colorSchema="secondary"
            leftIcon={<FontAwesomeIcon icon={faPlus} />}
          >
            Create Instance
          </Button>
        </div>

        <div>
          <div className="flex gap-2">
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              leftIcon={<FontAwesomeIcon icon={faMagnifyingGlass} />}
              placeholder="Search instances..."
              className="flex-1"
            />
          </div>
          <TableContainer className="mt-4">
            <Table>
              <THead>
                <Tr>
                  <Th className="w-1/4">Name</Th>
                  <Th className="w-1/4">Type</Th>
                  <Th className="w-1/4">Region</Th>
                  <Th className="w-1/4">Status</Th>
                  <Th className="w-5" />
                </Tr>
              </THead>
              <TBody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="flex items-center justify-center py-8">
                        <Spinner size="md" className="text-mineshaft-300" />
                      </div>
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState
                        title="Error loading instances"
                        icon={faServer}
                      >
                        <p className="text-sm text-bunker-400">
                          {error instanceof Error ? error.message : "An error occurred while loading instances"}
                        </p>
                      </EmptyState>
                    </td>
                  </tr>
                ) : filteredInstances.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <EmptyState
                        title={searchTerm ? "No Instances match search..." : "No Instances Found"}
                        icon={faServer}
                      >
                        <p className="text-sm text-bunker-400">
                          You don't have any dedicated instances yet. Create a new one to get started.
                        </p>
                      </EmptyState>
                    </td>
                  </tr>
                ) : (
                  filteredInstances.map((instance: DedicatedInstance) => (
                    <Tr
                      key={instance.id}
                      className={twMerge("group h-12 transition-colors duration-100 hover:bg-mineshaft-700 cursor-pointer")}
                      onClick={() => {
                        navigate({
                          to: "/organization/dedicated-instances/$instanceId",
                          params: {
                            instanceId: instance.id
                          }
                        });
                      }}
                    >
                      <Td>
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-bunker-700/50">
                            <FontAwesomeIcon icon={faServer} className="text-bunker-300" />
                          </div>
                          <div>
                            <p className="text-sm font-medium text-bunker-100">{instance.instanceName}</p>
                            <p className="text-xs text-bunker-300">Created {new Date(instance.createdAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <p className="text-sm font-medium text-bunker-100">
                          {`${instance.elasticContainerCpu / 1024} vCPU, ${instance.elasticContainerMemory / 1024}GB RAM`}
                        </p>
                        <p className="text-xs text-bunker-300">Instance Type</p>
                      </Td>
                      <Td>
                        <p className="text-sm font-medium text-bunker-100">
                          {REGIONS.aws.find(r => r.value === instance.region)?.label || instance.region}
                        </p>
                        <p className="text-xs text-bunker-300">Region</p>
                      </Td>
                      <Td>
                        {instance.status === "PROVISIONING" ? (
                          <div className="space-y-1">
                            <div className="flex items-center">
                              <span className="text-sm font-medium text-yellow-500">
                                {getDeploymentProgress(instance).stage}
                              </span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-mineshaft-600">
                              <div 
                                className="h-full rounded-full bg-yellow-500/50 transition-all duration-500 [animation:pulse_0.7s_cubic-bezier(0.4,0,0.6,1)_infinite]"
                                style={{ width: `${getDeploymentProgress(instance).progress}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div
                            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                              instance.status === "RUNNING"
                                ? "bg-emerald-100/10 text-emerald-500"
                                : instance.status === "FAILED"
                                ? "bg-red-100/10 text-red-500"
                                : "bg-yellow-100/10 text-yellow-500"
                            }`}
                          >
                            {instance.status.toLowerCase()}
                          </div>
                        )}
                      </Td>
                      <Td>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <IconButton
                              ariaLabel="Options"
                              colorSchema="secondary"
                              className="w-6"
                              variant="plain"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <FontAwesomeIcon icon={faEllipsisVertical} />
                            </IconButton>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(instance.id);
                            }}>
                              Copy Instance ID
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              // TODO: Start instance
                            }}>
                              Start Instance
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              // TODO: Stop instance
                            }}>
                              Stop Instance
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={(e) => {
                              e.stopPropagation();
                              // TODO: Delete instance
                            }} className="text-red-500">
                              Delete Instance
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </Td>
                    </Tr>
                  ))
                )}
              </TBody>
            </Table>
          </TableContainer>
        </div>
      </div>

      <Modal isOpen={isCreateModalOpen} onOpenChange={handleModalOpenChange}>
        <ModalContent title="Create Dedicated Instance" subTitle="Configure your dedicated Infisical instance">
          <div className="mt-6 space-y-6">
            <div>
              <div className="mb-2 text-sm font-medium text-mineshaft-200">Cloud Provider</div>
              <div className="grid grid-cols-3 gap-2">
                {PROVIDERS.map(({ value, label, image, description }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      if (value === "aws") {
                        setNewInstance({ ...newInstance, provider: value, region: "" });
                      }
                    }}
                    className={twMerge(
                      "group relative flex h-24 cursor-pointer flex-col items-center justify-center rounded-md border border-mineshaft-600 bg-mineshaft-700 p-4 duration-200 hover:bg-mineshaft-600",
                      newInstance.provider === value && "border-primary/50 bg-primary/10"
                    )}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-mineshaft-800">
                      <img
                        src={image}
                        alt={`${label} logo`}
                        className="h-7 w-7 object-contain"
                      />
                    </div>
                    <div className="mt-2 max-w-xs text-center text-sm font-medium text-gray-300 duration-200 group-hover:text-gray-200">
                      {label}
                    </div>
                  </button>
                ))}
              </div>
              <div className="mt-1 text-xs text-mineshaft-400">
                {PROVIDERS.find(p => p.value === newInstance.provider)?.description || "Select a cloud provider for your instance"}
              </div>
            </div>

            <FormControl label="Instance Name" helperText="Give your instance a unique name to identify it">
              <Input
                value={newInstance.instanceName}
                onChange={(e) => setNewInstance({ ...newInstance, instanceName: e.target.value })}
                placeholder="Enter instance name"
              />
            </FormControl>

            <FormControl label="Subdomain" helperText="Enter the subdomain for your instance">
              <div className="flex items-center">
                <Input
                  value={newInstance.subdomain}
                  onChange={(e) => setNewInstance({ ...newInstance, subdomain: e.target.value })}
                  placeholder="your-subdomain"
                  className="rounded-r-none"
                />
                <div className="flex h-10 items-center rounded-r-lg border border-l-0 border-mineshaft-600 bg-mineshaft-800 px-3 text-sm text-mineshaft-300">
                  .infisical.com
                </div>
              </div>
            </FormControl>

            <FormControl label="Region" helperText="Select the geographical location where your instance will be deployed">
              <Select
                value={newInstance.region}
                onValueChange={(value) => setNewInstance({ ...newInstance, region: value })}
                placeholder="Select region"
                isDisabled={!newInstance.provider}
              >
                {availableRegions.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </Select>
            </FormControl>

            <FormControl label="Cluster Size" helperText="Select the size of your dedicated instance">
              <Select
                value={newInstance.clusterSize}
                onValueChange={(value) => setNewInstance({ ...newInstance, clusterSize: value as "small" | "medium" | "large" })}
                placeholder="Select size"
              >
                <SelectItem value="small">Small (1 vCPU, 2GB RAM)</SelectItem>
                <SelectItem value="medium">Medium (2 vCPU, 4GB RAM)</SelectItem>
                <SelectItem value="large">Large (4 vCPU, 8GB RAM)</SelectItem>
              </Select>
            </FormControl>
          </div>

          <div className="mt-8 flex justify-end space-x-4">
            <Button
              variant="plain"
              colorSchema="secondary"
              onClick={() => setIsCreateModalOpen(false)}
              size="md"
              disabled={createInstanceMutation.status === "pending"}
            >
              Cancel
            </Button>
            <Button
              variant="solid"
              colorSchema="primary"
              onClick={handleCreateInstance}
              disabled={!newInstance.instanceName || !newInstance.region || !newInstance.provider || !newInstance.subdomain || createInstanceMutation.status === "pending"}
              size="md"
              leftIcon={createInstanceMutation.status === "pending" ? <Spinner size="xs" className="text-black" /> : undefined}
            >
              {createInstanceMutation.status === "pending" ? "Creating..." : "Create Instance"}
            </Button>
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
}; 