import { useMemo } from "react";
import { InfoIcon, TriangleAlertIcon } from "lucide-react";

import {
  Alert,
  AlertDescription,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyHeader,
  EmptyTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { IdentityAuthMethod, identityAuthToNameMap, TOrgAuthMethodUsage } from "@app/hooks/api";

import { CHART_COLORS, UNKNOWN_SERIES_COLOR } from "./chartColors";

type Segment = {
  key: string;
  label: string;
  count: number;
  pct: number;
  color: string;
  isUnknown: boolean;
};

const humanizeAuthMethod = (authMethod: string) =>
  identityAuthToNameMap[authMethod as IdentityAuthMethod] ??
  authMethod
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

export const AuthMethodsCard = ({ data }: { data: TOrgAuthMethodUsage }) => {
  const segments = useMemo<Segment[]>(() => {
    if (data.totalFetches === 0) return [];

    const methodSegments: Segment[] = [...data.methods]
      .sort((a, b) => b.count - a.count)
      .map((method, index) => ({
        key: method.authMethod,
        label: humanizeAuthMethod(method.authMethod),
        count: method.count,
        pct: (method.count / data.totalFetches) * 100,
        color: CHART_COLORS[index % CHART_COLORS.length],
        isUnknown: false
      }));

    if (data.unknownCount > 0) {
      methodSegments.push({
        key: "unknown",
        label: "Unknown",
        count: data.unknownCount,
        pct: (data.unknownCount / data.totalFetches) * 100,
        color: UNKNOWN_SERIES_COLOR,
        isUnknown: true
      });
    }

    return methodSegments;
  }, [data]);

  const staticTokenPct = useMemo(() => {
    if (data.totalFetches === 0) return 0;
    const staticTokenCount =
      data.methods.find((method) => method.authMethod === IdentityAuthMethod.TOKEN_AUTH)?.count ??
      0;
    return (staticTokenCount / data.totalFetches) * 100;
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Auth Methods Used to Fetch Secrets</CardTitle>
        <CardDescription>
          Share of authenticated fetches by machine identity auth method, past 7 days.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {segments.length === 0 && (
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyTitle>No secret fetch data yet</EmptyTitle>
            </EmptyHeader>
          </Empty>
        )}
        {segments.length > 0 && (
          <div className="flex flex-col gap-5">
            <div className="flex h-2.5 w-full gap-px overflow-hidden rounded-full">
              {segments.map((segment) => (
                <div
                  key={segment.key}
                  className="min-w-[3px]"
                  style={{ width: `${segment.pct}%`, backgroundColor: segment.color }}
                />
              ))}
            </div>
            <div className="flex flex-col">
              {segments.map((segment, index) => (
                <div
                  key={segment.key}
                  className={`flex items-center gap-3 py-2 ${
                    index < segments.length - 1 ? "border-b border-border" : ""
                  }`}
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: segment.color }}
                  />
                  <span className="flex-1 text-sm">
                    {segment.label}
                    {segment.isUnknown && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <InfoIcon className="mb-0.5 ml-1 inline size-3 text-muted" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs text-xs">
                            Only new requests will display the auth method. Older requests may not
                            have this information recorded.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </span>
                  <span className="text-sm text-muted">
                    {segment.count.toLocaleString()} {segment.count === 1 ? "fetch" : "fetches"}
                  </span>
                  <span className="min-w-[48px] text-right text-sm font-medium">
                    {Math.round(segment.pct)}%
                  </span>
                </div>
              ))}
            </div>
            {staticTokenPct > 0 && (
              <Alert variant="warning">
                <TriangleAlertIcon />
                <AlertDescription>
                  {Math.round(staticTokenPct)}% of fetches still use static tokens. Migrate those
                  identities to a workload auth method to remove long-lived credentials.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
