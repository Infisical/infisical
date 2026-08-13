import { createNotification } from "@app/components/notifications";
import { Switch, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import {
  AlertChannelType,
  AlertPrincipalType,
  useCreateAlert,
  useDeleteAlert,
  useListAlerts
} from "@app/hooks/api/alerts";
import { TEndpointNetworkRule } from "@app/hooks/api/endpoint";

// Mirrors the backend provider. A transfer limit is the only rule that can be exceeded, so it is the
// only one this appears on.
const RESOURCE_TYPE = "endpoint.transfer_violation";
const EVENT_TYPE = "endpoint.transfer_violation.tripped";

type Props = {
  rule: TEndpointNetworkRule;
  orgId: string;
  projectId: string;
  isAllowed: boolean;
};

// One switch rather than a full alert editor: the only question worth asking about a transfer limit
// is whether the admins should hear about it. Anything richer — other channels, other recipients —
// is the shared alert API, which this is built on rather than around.
export const RuleAlertToggle = ({ rule, orgId, projectId, isAllowed }: Props) => {
  const { data: alerts, isPending } = useListAlerts({
    resourceType: RESOURCE_TYPE,
    projectId,
    resourceId: rule.id
  });

  const createAlert = useCreateAlert();
  const deleteAlert = useDeleteAlert();

  const existing = alerts?.[0];
  const isBusy = isPending || createAlert.isPending || deleteAlert.isPending;

  const onToggle = async (enabled: boolean) => {
    try {
      if (enabled) {
        await createAlert.mutateAsync({
          name: `${rule.name} exceeded`,
          resourceType: RESOURCE_TYPE,
          resourceId: rule.id,
          eventType: EVENT_TYPE,
          condition: {},
          projectId,
          channels: [
            {
              name: "Organization admins",
              channelType: AlertChannelType.Email,
              config: {},
              // Not a snapshot of today's admins: the backend resolves this at send time, so someone
              // promoted tomorrow is covered and someone removed is not.
              recipients: [{ principalType: AlertPrincipalType.OrgAdmins, principalId: orgId }]
            }
          ]
        });
        createNotification({ text: "Organization admins will be emailed on a violation.", type: "success" });
        return;
      }

      if (existing) {
        await deleteAlert.mutateAsync({ alertId: existing.id });
        createNotification({ text: "Email alerts turned off for this rule.", type: "success" });
      }
    } catch {
      // Reported globally by the mutation cache.
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="inline-flex">
          <Switch
            checked={Boolean(existing)}
            disabled={!isAllowed || isBusy}
            onCheckedChange={onToggle}
            aria-label="Email organization admins when this limit is exceeded"
          />
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {isAllowed
          ? "Email every organization admin when a device exceeds this limit."
          : "You do not have permission to change alerting for this rule."}
      </TooltipContent>
    </Tooltip>
  );
};
