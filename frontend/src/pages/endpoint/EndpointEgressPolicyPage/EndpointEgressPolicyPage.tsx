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
import { usePopUp } from "@app/hooks";
import {
  EndpointEgressRuleAction,
  EndpointEgressRuleType,
  TEndpointEgressRule,
  useListEndpointEgressRules,
  useUpdateEndpointEgressRule
} from "@app/hooks/api/endpoint";
import { ProjectType } from "@app/hooks/api/projects/types";

import { DeleteEgressRuleModal } from "./components/DeleteEgressRuleModal";
import { EgressRuleModal } from "./components/EgressRuleModal";

const KIND_LABEL: Record<TEndpointEgressRule["kind"], string> = {
  ip: "IP Address",
  cidr: "CIDR Block",
  domain: "Domain"
};

const ActionBadge = ({ action }: { action?: EndpointEgressRuleAction | null }) => {
  if (action === EndpointEgressRuleAction.Allow) {
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

export const EndpointEgressPolicyPage = () => {
  const { data: rules, isPending } = useListEndpointEgressRules();
  const updateRule = useUpdateEndpointEgressRule();
  const { popUp, handlePopUpOpen, handlePopUpClose } = usePopUp([
    "ruleModal",
    "deleteRule"
  ] as const);

  const destinationRules = useMemo(
    () => (rules ?? []).filter((rule) => rule.ruleType === EndpointEgressRuleType.Destination),
    [rules]
  );

  const onToggleEnabled = (rule: TEndpointEgressRule, isEnabled: boolean) => {
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
        <title>Endpoint Egress Policy</title>
      </Helmet>
      <div className="mx-auto mb-6 w-full max-w-8xl">
        <PageHeader
          scope={ProjectType.Endpoint}
          title="Egress Policy"
          description="Destinations that devices deny or allow outbound connections to."
        />

        <Card>
          <CardHeader>
            <CardTitle>Egress Rules</CardTitle>
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

          {!isPending && destinationRules.length === 0 && (
            <CardContent>
              <Empty className="border">
                <EmptyMedia variant="icon">
                  <ShieldBanIcon />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>No egress rules yet</EmptyTitle>
                  <EmptyDescription>
                    Add a rule to start denying outbound connections from registered devices.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </CardContent>
          )}

          {!isPending && destinationRules.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Enabled</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {destinationRules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium text-foreground">{rule.name}</TableCell>
                    <TableCell className="text-muted">{KIND_LABEL[rule.kind]}</TableCell>
                    <TableCell className="font-mono text-xs text-muted">
                      {rule.destination}
                    </TableCell>
                    <TableCell>
                      <ActionBadge action={rule.action} />
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

      <EgressRuleModal
        rule={popUp.ruleModal.data as TEndpointEgressRule | undefined}
        isOpen={popUp.ruleModal.isOpen}
        onOpenChange={(open) => {
          if (!open) handlePopUpClose("ruleModal");
        }}
      />

      <DeleteEgressRuleModal
        rule={popUp.deleteRule.data as TEndpointEgressRule | undefined}
        isOpen={popUp.deleteRule.isOpen}
        onOpenChange={(open) => {
          if (!open) handlePopUpClose("deleteRule");
        }}
      />
    </>
  );
};
