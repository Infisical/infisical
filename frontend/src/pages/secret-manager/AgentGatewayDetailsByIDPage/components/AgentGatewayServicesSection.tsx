import { useEffect, useState } from "react";
import { ArrowLeftRight, PlusIcon, SearchIcon, XIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { CreateProxiedServiceModal } from "@app/components/proxied-services";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import {
  ProjectPermissionAgentGatewayActions,
  ProjectPermissionProxiedServiceActions,
  ProjectPermissionSub
} from "@app/context/ProjectPermissionContext/types";
import { PROXIED_SERVICE_TEMPLATES } from "@app/helpers/proxiedServiceTemplates";
import { useDebounce, usePopUp } from "@app/hooks";
import {
  TAgentGateway,
  useLinkProxiedService,
  useUnlinkProxiedService
} from "@app/hooks/api/agentGateways";
import { useListProxiedServices } from "@app/hooks/api/proxiedServices/queries";

// A service is stored by host pattern, not by the template it came from, so the logo is recovered by
// matching the first host back to a template. No match just means the generic icon.
const templateImageFor = (hostPattern: string) => {
  const firstHost = hostPattern.split(",")[0]?.trim().toLowerCase();
  if (!firstHost) return undefined;

  return PROXIED_SERVICE_TEMPLATES.find((template) =>
    template.hostPattern
      .split(",")
      .some((templateHost) => templateHost.trim().toLowerCase() === firstHost)
  )?.image;
};

type Props = {
  agentGateway: TAgentGateway;
};

export const AgentGatewayServicesSection = ({ agentGateway }: Props) => {
  const { popUp, handlePopUpOpen, handlePopUpToggle } = usePopUp([
    "connectServices",
    "createService"
  ] as const);
  const { data } = useListProxiedServices({ projectId: agentGateway.projectId });
  const linkService = useLinkProxiedService();
  const unlinkService = useUnlinkProxiedService();

  const linkedIds = new Set(agentGateway.proxiedServices.map((s) => s.id));
  const [selected, setSelected] = useState<Set<string>>(linkedIds);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebounce(search);

  const results = (data?.services ?? []).filter((service) => {
    if (!debouncedSearch) return true;
    const needle = debouncedSearch.toLowerCase();
    return (
      service.name.toLowerCase().includes(needle) ||
      service.hostPattern.toLowerCase().includes(needle)
    );
  });

  // Re-seed whenever the drawer opens so it reflects what is actually linked rather than a stale selection
  // from a previous open.
  useEffect(() => {
    if (popUp.connectServices.isOpen) {
      setSelected(new Set(agentGateway.proxiedServices.map((s) => s.id)));
    }
  }, [popUp.connectServices.isOpen, agentGateway.proxiedServices]);

  const onSave = async () => {
    const current = new Set(agentGateway.proxiedServices.map((s) => s.id));
    const toLink = [...selected].filter((id) => !current.has(id));
    const toUnlink = [...current].filter((id) => !selected.has(id));

    // Sequential rather than concurrent: each link call re-reads the link set to append a priority, so
    // running them in parallel would race and hand two services the same position.
    await toLink.reduce(
      (chain, serviceId) =>
        chain.then(async () => {
          await linkService.mutateAsync({ agentGatewayId: agentGateway.id, serviceId });
        }),
      Promise.resolve()
    );
    await toUnlink.reduce(
      (chain, serviceId) =>
        chain.then(async () => {
          await unlinkService.mutateAsync({ agentGatewayId: agentGateway.id, serviceId });
        }),
      Promise.resolve()
    );

    createNotification({ text: "Successfully updated connected services", type: "success" });
    handlePopUpToggle("connectServices", false);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Proxied Services</CardTitle>
          <CardDescription>Services this gateway is allowed to proxy requests to.</CardDescription>
          <CardAction>
            <ProjectPermissionCan
              I={ProjectPermissionAgentGatewayActions.ManageServices}
              a={ProjectPermissionSub.AgentGateways}
            >
              {(isAllowed) => (
                <Button
                  variant="project"
                  isDisabled={!isAllowed}
                  onClick={() => handlePopUpOpen("connectServices")}
                >
                  <PlusIcon />
                  Connect Services
                </Button>
              )}
            </ProjectPermissionCan>
          </CardAction>
        </CardHeader>
        <CardContent>
          {!agentGateway.proxiedServices.length ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ArrowLeftRight />
                </EmptyMedia>
                <EmptyTitle>No services connected</EmptyTitle>
                <EmptyDescription>
                  Agents cannot reach any service through this gateway yet.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="divide-y divide-mineshaft-600 overflow-hidden rounded border border-mineshaft-600">
              {agentGateway.proxiedServices.map((service) => (
                <div key={service.id} className="flex items-center gap-x-3 px-3 py-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded bg-mineshaft-700 text-mineshaft-300">
                    <ArrowLeftRight size={14} />
                  </span>
                  <span className="min-w-0 truncate text-sm text-mineshaft-100">
                    {service.name}
                  </span>
                  <code className="min-w-0 flex-1 truncate font-mono text-xs text-mineshaft-400">
                    {service.hostPattern}
                  </code>
                  {!service.isEnabled && (
                    <Badge variant="warning" className="shrink-0">
                      Disabled
                    </Badge>
                  )}
                  <ProjectPermissionCan
                    I={ProjectPermissionAgentGatewayActions.ManageServices}
                    a={ProjectPermissionSub.AgentGateways}
                  >
                    {(isAllowed) => (
                      <IconButton
                        aria-label={`Disconnect ${service.name}`}
                        variant="ghost"
                        size="xs"
                        className="shrink-0"
                        isDisabled={!isAllowed}
                        onClick={() =>
                          unlinkService.mutate({
                            agentGatewayId: agentGateway.id,
                            serviceId: service.id
                          })
                        }
                      >
                        <XIcon />
                      </IconButton>
                    )}
                  </ProjectPermissionCan>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet
        open={popUp.connectServices.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("connectServices", isOpen)}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Connect Proxied Services</SheetTitle>
            <p className="text-sm text-mineshaft-300">
              Select the services this gateway is allowed to proxy.
            </p>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-y-4 overflow-y-auto p-4">
            <InputGroup>
              <InputGroupAddon>
                <SearchIcon />
              </InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search services..."
              />
            </InputGroup>

            {results.length ? (
              <div className="divide-y divide-mineshaft-600 overflow-hidden rounded border border-mineshaft-600">
                {results.map((service) => (
                  <label
                    key={service.id}
                    className="flex cursor-pointer items-center gap-x-3 px-3 py-2 hover:bg-mineshaft-700/40"
                    htmlFor={`connect-${service.id}`}
                  >
                    <Checkbox
                      id={`connect-${service.id}`}
                      variant="project"
                      isChecked={selected.has(service.id)}
                      onCheckedChange={(isChecked) => {
                        const next = new Set(selected);
                        if (isChecked) next.add(service.id);
                        else next.delete(service.id);
                        setSelected(next);
                      }}
                    />
                    <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded bg-mineshaft-700">
                      {templateImageFor(service.hostPattern) ? (
                        <img
                          src={`/images/integrations/${templateImageFor(service.hostPattern)}`}
                          alt=""
                          className="size-4 object-contain"
                        />
                      ) : (
                        <ArrowLeftRight size={14} className="text-mineshaft-300" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-mineshaft-100">
                      {service.name}
                    </span>
                    <code className="shrink-0 font-mono text-xs text-mineshaft-400">
                      {service.hostPattern}
                    </code>
                  </label>
                ))}
              </div>
            ) : (
              <p className="rounded border border-dashed border-mineshaft-600 px-3 py-6 text-center text-sm text-mineshaft-400">
                {search
                  ? "No services match your search."
                  : "This project has no proxied services yet."}
              </p>
            )}

            {/* Creating one here rather than sending the reader off to another page, since an empty list is
                exactly when someone needs it. */}
            <ProjectPermissionCan
              I={ProjectPermissionProxiedServiceActions.Create}
              a={ProjectPermissionSub.ProxiedServices}
            >
              {(isAllowed) => (
                <Button
                  variant="outline"
                  className="self-start"
                  isDisabled={!isAllowed}
                  onClick={() => handlePopUpOpen("createService")}
                >
                  <PlusIcon />
                  Create Proxied Service
                </Button>
              )}
            </ProjectPermissionCan>
          </div>
          <SheetFooter>
            <Button variant="ghost" onClick={() => handlePopUpToggle("connectServices", false)}>
              Cancel
            </Button>
            <Button
              variant="project"
              onClick={onSave}
              isPending={linkService.isPending || unlinkService.isPending}
            >
              Save
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <CreateProxiedServiceModal
        isOpen={popUp.createService.isOpen}
        onOpenChange={(isOpen) => handlePopUpToggle("createService", isOpen)}
        projectId={agentGateway.projectId}
        existingNames={(data?.services ?? []).map((service) => service.name)}
      />
    </>
  );
};
