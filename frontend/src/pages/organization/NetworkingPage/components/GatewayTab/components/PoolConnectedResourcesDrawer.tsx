import { Link } from "@tanstack/react-router";
import { ExternalLinkIcon } from "lucide-react";

import { Spinner } from "@app/components/v2";
import {
  Badge,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  UnstableAccordion,
  UnstableAccordionContent,
  UnstableAccordionItem,
  UnstableAccordionTrigger
} from "@app/components/v3";
import { useOrganization } from "@app/context";
import {
  TGatewayPoolConnectedResources,
  useGetGatewayPoolConnectedResources
} from "@app/hooks/api/gateway-pools";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  poolId: string;
  poolName: string;
};

const getTotalResourceCount = (resources: TGatewayPoolConnectedResources | undefined): number => {
  if (!resources) return 0;
  return resources.kubernetesAuths.length;
};

type ResourceRowProps = {
  name: string;
  subtitle: string;
  to: string;
  params: Record<string, string>;
  isLast?: boolean;
};

const ResourceRow = ({ name, subtitle, to, params, isLast }: ResourceRowProps) => {
  return (
    <Link
      to={to as "/"}
      params={params}
      className={`flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-mineshaft-700/30 ${
        !isLast ? "border-b border-mineshaft-600" : ""
      }`}
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-sm text-mineshaft-100">{name}</span>
        <span className="text-xs text-mineshaft-400">{subtitle}</span>
      </div>
      <ExternalLinkIcon className="size-3.5 text-mineshaft-400" />
    </Link>
  );
};

export const PoolConnectedResourcesDrawer = ({ isOpen, onOpenChange, poolId, poolName }: Props) => {
  const { currentOrg } = useOrganization();
  const { data: resources, isPending } = useGetGatewayPoolConnectedResources(isOpen ? poolId : "");

  const totalCount = getTotalResourceCount(resources);

  const defaultOpenSections = [resources?.kubernetesAuths.length ? "kubernetes-auth" : null].filter(
    Boolean
  ) as string[];

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader className="border-b border-mineshaft-600">
          <SheetTitle>Connected Resources</SheetTitle>
          <SheetDescription>{poolName}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 px-4">
          {isPending ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-mineshaft-300">
                {totalCount > 0 ? (
                  <>
                    {totalCount} resource{totalCount !== 1 ? "s" : ""} connected
                  </>
                ) : (
                  "No resources connected to this pool"
                )}
              </p>

              {totalCount > 0 && (
                <UnstableAccordion type="multiple" defaultValue={defaultOpenSections}>
                  {(resources?.kubernetesAuths.length ?? 0) > 0 && (
                    <UnstableAccordionItem value="kubernetes-auth">
                      <UnstableAccordionTrigger>
                        <span className="flex-1">Kubernetes Auth</span>
                        <Badge variant="neutral">{resources?.kubernetesAuths.length}</Badge>
                      </UnstableAccordionTrigger>
                      <UnstableAccordionContent className="p-0">
                        {resources?.kubernetesAuths.map((auth, idx) => (
                          <ResourceRow
                            key={auth.id}
                            name={auth.identityName ?? auth.identityId}
                            subtitle="Machine Identity"
                            to="/organizations/$orgId/identities/$identityId"
                            params={{
                              orgId: currentOrg.id,
                              identityId: auth.identityId
                            }}
                            isLast={idx === (resources?.kubernetesAuths.length ?? 0) - 1}
                          />
                        ))}
                      </UnstableAccordionContent>
                    </UnstableAccordionItem>
                  )}
                </UnstableAccordion>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
