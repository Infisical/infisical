import { useEffect, useState } from "react";
import { faEdit } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { format } from "date-fns";

import { createNotification } from "@app/components/notifications";
import { ProjectPermissionCan } from "@app/components/permissions";
import {
  GenericFieldLabel,
  IconButton,
  Input,
  Select,
  SelectItem,
  Switch
} from "@app/components/v2";
import { ProjectPermissionMcpEndpointActions, ProjectPermissionSub } from "@app/context";
import { TAiMcpEndpointWithServerIds } from "@app/hooks/api";

type Props = {
  endpoint: TAiMcpEndpointWithServerIds;
  onEdit: VoidFunction;
};

type RateLimitSettings = {
  enabled: boolean;
  limit: number;
  timeUnit: "minute" | "hour" | "day";
};

const RATE_LIMIT_STORAGE_KEY_PREFIX = "mcp_endpoint_rate_limit_";

const getStatusLabel = (status: string | null) => {
  const labels: Record<string, string> = {
    active: "Active",
    inactive: "Inactive"
  };
  return labels[status || "inactive"] || "Unknown";
};

const getStatusColor = (status: string | null) => {
  const colors: Record<string, string> = {
    active: "bg-emerald-500",
    inactive: "bg-red-500"
  };
  return colors[status || "inactive"] || "bg-red-500";
};

const SHOW_RATE_LIMITING_SECTION = false;

export const MCPEndpointDetailsSection = ({ endpoint, onEdit }: Props) => {
  const [rateLimitSettings, setRateLimitSettings] = useState<RateLimitSettings>({
    enabled: false,
    limit: 100,
    timeUnit: "hour"
  });
  const [hasLoadedRateLimit, setHasLoadedRateLimit] = useState(false);

  const rateLimitStorageKey = `${RATE_LIMIT_STORAGE_KEY_PREFIX}${endpoint.id}`;

  // Load rate limit settings from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(rateLimitStorageKey);
    if (stored) {
      try {
        setRateLimitSettings(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse stored rate limit settings", e);
      }
    }
    setHasLoadedRateLimit(true);
  }, [rateLimitStorageKey]);

  // Save rate limit settings to localStorage whenever they change
  useEffect(() => {
    if (hasLoadedRateLimit) {
      localStorage.setItem(rateLimitStorageKey, JSON.stringify(rateLimitSettings));
    }
  }, [rateLimitSettings, rateLimitStorageKey, hasLoadedRateLimit]);

  const handleRateLimitToggle = (checked: boolean) => {
    setRateLimitSettings((prev) => ({ ...prev, enabled: checked }));
    createNotification({
      text: `Rate limiting ${checked ? "enabled" : "disabled"}`,
      type: "success"
    });
  };

  const handleRateLimitChange = (limit: string) => {
    const numLimit = parseInt(limit, 10);
    if (!Number.isNaN(numLimit) && numLimit > 0) {
      setRateLimitSettings((prev) => ({ ...prev, limit: numLimit }));
    }
  };

  const handleTimeUnitChange = (timeUnit: string) => {
    setRateLimitSettings((prev) => ({
      ...prev,
      timeUnit: timeUnit as "minute" | "hour" | "day"
    }));
  };

  return (
    <div className="flex w-full flex-col gap-3 rounded-lg border border-mineshaft-600 bg-mineshaft-900 px-4 py-3">
      <div className="flex items-center justify-between border-b border-mineshaft-400 pb-2">
        <h3 className="text-lg font-medium text-mineshaft-100">Details</h3>
        <ProjectPermissionCan
          I={ProjectPermissionMcpEndpointActions.Edit}
          a={ProjectPermissionSub.McpEndpoints}
        >
          {(isAllowed) => (
            <IconButton
              variant="plain"
              colorSchema="secondary"
              ariaLabel="Edit endpoint details"
              onClick={onEdit}
              isDisabled={!isAllowed}
            >
              <FontAwesomeIcon icon={faEdit} />
            </IconButton>
          )}
        </ProjectPermissionCan>
      </div>
      <div className="space-y-3">
        <GenericFieldLabel label="Name">{endpoint.name}</GenericFieldLabel>
        <GenericFieldLabel label="Description">
          {endpoint.description || <span className="text-bunker-400">No description</span>}
        </GenericFieldLabel>
        <GenericFieldLabel label="Status">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${getStatusColor(endpoint.status)}`} />
            {getStatusLabel(endpoint.status)}
          </div>
        </GenericFieldLabel>
        <GenericFieldLabel label="Created">
          {format(new Date(endpoint.createdAt), "yyyy-MM-dd, hh:mm aaa")}
        </GenericFieldLabel>
        {SHOW_RATE_LIMITING_SECTION && (
          <div className="border-t border-mineshaft-500 pt-3">
            <div className="flex items-start justify-between">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-mineshaft-200">Rate Limiting</span>
                </div>
                <span className="text-xs text-bunker-400">Limit tool invocations per user</span>
              </div>
              <Switch
                id={`rate-limiting-${endpoint.id}`}
                isChecked={rateLimitSettings.enabled}
                onCheckedChange={handleRateLimitToggle}
              />
            </div>

            {rateLimitSettings.enabled && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Input
                  type="number"
                  value={rateLimitSettings.limit.toString()}
                  onChange={(e) => handleRateLimitChange(e.target.value)}
                  min={1}
                  placeholder="100"
                />
                <Select value={rateLimitSettings.timeUnit} onValueChange={handleTimeUnitChange}>
                  <SelectItem value="minute">per minute</SelectItem>
                  <SelectItem value="hour">per hour</SelectItem>
                  <SelectItem value="day">per day</SelectItem>
                </Select>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
