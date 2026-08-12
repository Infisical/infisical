import { useMemo } from "react";
import { Helmet } from "react-helmet";
import { format } from "date-fns";
import { MoreHorizontal, Plus, ShieldBanIcon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import { PageHeader } from "@app/components/v2";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  IconButton,
  Skeleton,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/context";
import { formatBytes } from "@app/helpers/bytes";
import { usePopUp } from "@app/hooks";
import {
  EndpointNetworkRuleAction,
  EndpointNetworkRuleType,
  TEndpointNetworkRule,
  useListEndpointNetworkRules,
  useUpdateEndpointNetworkRule
} from "@app/hooks/api/endpoint";
import { ProjectType } from "@app/hooks/api/projects/types";

import { DeleteNetworkRuleModal } from "./components/DeleteNetworkRuleModal";
import { NetworkRuleModal } from "./components/NetworkRuleModal";

const KIND_LABEL: Record<TEndpointNetworkRule["kind"], string> = {
  ip: "IP Address",
  cidr: "CIDR Block",
  domain: "Domain"
};

const ActionBadge = ({ action }: { action?: EndpointNetworkRuleAction | null }) => {
  if (action === EndpointNetworkRuleAction.Allow) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="neutral" className="cursor-default">
            Allow
          </Badge>
        </TooltipTrigger>
        <TooltipContent>Allow rules are not enforced by agents yet.</TooltipContent>
      </Tooltip>
    );
  }

  return <Badge variant="danger">Deny</Badge>;
};

// A volume rule has no action of its own: it allows the destination until the threshold is crossed,
// so the threshold is the meaningful thing to show in this column.
const EnforcementCell = ({ rule }: { rule: TEndpointNetworkRule }) => {
  if (rule.ruleType !== EndpointNetworkRuleType.Volume) {
    return <ActionBadge action={rule.action} />;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="warning" className="cursor-default">
          Limit {formatBytes(rule.thresholdBytes ?? 0)}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        Blocked once a device has sent more than {formatBytes(rule.thresholdBytes ?? 0)} to this
        destination.
      </TooltipContent>
    </Tooltip>
  );
};

export const EndpointNetworkPolicyPage = () => {
  const { data: rules, isPending } = useListEndpointNetworkRules();
  const updateRule = useUpdateEndpointNetworkRule();
  const { popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "ruleModal",
    "deleteRule"
  ] as const);

  // Destination rules first: they are the unconditional ones, and a reader should see what is
  // always blocked before what is only blocked past a threshold.
  const sortedRules = useMemo(
    () =>
      [...(rules ?? [])].sort((a, b) => {
        if (a.ruleType !== b.ruleType)
          return a.ruleType === EndpointNetworkRuleType.Volume ? 1 : -1;
        return a.createdAt < b.createdAt ? 1 : -1;
      }),
    [rules]
  );

  const onToggleEnabled = (rule: TEndpointNetworkRule, isEnabled: boolean) => {
    updateRule.mutate(
      { ruleId: rule.id, isEnabled },
      {
        onSuccess: () => {
          createNotification({
            type: "success",
            text: `Rule "${rule.name}" ${isEnabled ? "enabled" : "disabled"}`
          });
        }
      }
    );
  };

  return (
    <>
      <Helmet>
        <title>Endpoint Network Policy</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.Endpoint}
          title="Network Policy"
          description="Destinations devices may not reach, and how much they may send to the ones they can."
        />

        <Card>
          <CardHeader>
            <CardTitle>Network Rules</CardTitle>
            <CardAction>
              <ProjectPermissionCan
                I={ProjectPermissionActions.Create}
                a={ProjectPermissionSub.Endpoint}
              >
                {(isAllowed) => (
                  <Button
                    variant="endpoint"
                    isDisabled={!isAllowed}
                    onClick={() => handlePopUpOpen("ruleModal")}
                  >
                    <Plus />
                    Add Rule
                  </Button>
                )}
              </ProjectPermissionCan>
            </CardAction>
          </CardHeader>

          {isPending && (
            <CardContent>
              <div className="flex flex-col gap-3">
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            </CardContent>
          )}

          {!isPending && sortedRules.length === 0 && (
            <CardContent>
              <Empty className="border">
                <EmptyMedia variant="icon">
                  <ShieldBanIcon />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>No network rules yet</EmptyTitle>
                  <EmptyDescription>
                    Add a rule to block a destination outright, or to cap how much a device may send
                    to it.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </CardContent>
          )}

          {!isPending && sortedRules.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Enforcement</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium text-foreground">{rule.name}</TableCell>
                    <TableCell className="text-muted">{KIND_LABEL[rule.kind]}</TableCell>
                    <TableCell className="font-mono text-xs text-muted">
                      {rule.destination}
                    </TableCell>
                    <TableCell>
                      <EnforcementCell rule={rule} />
                    </TableCell>
                    <TableCell>
                      <ProjectPermissionCan
                        I={ProjectPermissionActions.Edit}
                        a={ProjectPermissionSub.Endpoint}
                      >
                        {(isAllowed) => (
                          <Switch
                            variant="endpoint"
                            checked={rule.isEnabled}
                            disabled={!isAllowed || updateRule.isPending}
                            onCheckedChange={(checked) => onToggleEnabled(rule, checked)}
                            aria-label={`Toggle "${rule.name}"`}
                          />
                        )}
                      </ProjectPermissionCan>
                    </TableCell>
                    <TableCell className="text-muted">
                      {format(new Date(rule.createdAt), "yyyy-MM-dd")}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <IconButton
                            variant="ghost"
                            size="xs"
                            aria-label={`Actions for ${rule.name}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </IconButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Edit}
                            a={ProjectPermissionSub.Endpoint}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                isDisabled={!isAllowed}
                                onClick={() => handlePopUpOpen("ruleModal", rule)}
                              >
                                Edit
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                          <ProjectPermissionCan
                            I={ProjectPermissionActions.Delete}
                            a={ProjectPermissionSub.Endpoint}
                          >
                            {(isAllowed) => (
                              <DropdownMenuItem
                                variant="danger"
                                isDisabled={!isAllowed}
                                onClick={() => handlePopUpOpen("deleteRule", rule)}
                              >
                                Delete
                              </DropdownMenuItem>
                            )}
                          </ProjectPermissionCan>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>

      <NetworkRuleModal
        rule={popUp.ruleModal.data as TEndpointNetworkRule | undefined}
        isOpen={popUp.ruleModal.isOpen}
        onOpenChange={(open) => {
          if (!open) handlePopUpClose("ruleModal");
        }}
      />

      <DeleteNetworkRuleModal
        rule={popUp.deleteRule.data as TEndpointNetworkRule | undefined}
        isOpen={popUp.deleteRule.isOpen}
        onOpenChange={(open) => {
          if (!open) handlePopUpClose("deleteRule");
        }}
      />
    </>
  );
};
