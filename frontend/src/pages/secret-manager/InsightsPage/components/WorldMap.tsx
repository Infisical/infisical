import { useMemo, useState } from "react";
import { geoNaturalEarth1, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";

import {
  Badge,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  UnstableCard,
  UnstableCardContent,
  UnstableCardDescription,
  UnstableCardHeader,
  UnstableCardTitle
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useGetSecretAccessLocations } from "@app/hooks/api";
import { TAccessLocation } from "@app/hooks/api/secretInsights/types";

import worldTopoJson from "./countries-110m.json";

// ISO 3166-1 alpha-2 → numeric mapping (covers common countries; extend as needed)
/* eslint-disable @typescript-eslint/naming-convention */
const ALPHA2_TO_NUMERIC: Record<string, string> = {
  AF: "004",
  AL: "008",
  DZ: "012",
  AR: "032",
  AU: "036",
  AT: "040",
  BD: "050",
  BE: "056",
  BR: "076",
  BG: "100",
  CA: "124",
  CL: "152",
  CN: "156",
  CO: "170",
  HR: "191",
  CZ: "203",
  DK: "208",
  EG: "818",
  EE: "233",
  FI: "246",
  FR: "250",
  DE: "276",
  GR: "300",
  HK: "344",
  HU: "348",
  IN: "356",
  ID: "360",
  IR: "364",
  IQ: "368",
  IE: "372",
  IL: "376",
  IT: "380",
  JP: "392",
  KE: "404",
  KR: "410",
  LV: "428",
  LT: "440",
  MY: "458",
  MX: "484",
  MA: "504",
  NL: "528",
  NZ: "554",
  NG: "566",
  NO: "578",
  PK: "586",
  PE: "604",
  PH: "608",
  PL: "616",
  PT: "620",
  RO: "642",
  RU: "643",
  SA: "682",
  SG: "702",
  ZA: "710",
  ES: "724",
  SE: "752",
  CH: "756",
  TW: "158",
  TH: "764",
  TR: "792",
  UA: "804",
  AE: "784",
  GB: "826",
  US: "840",
  VN: "704",
  KZ: "398",
  CY: "196"
};
/* eslint-enable @typescript-eslint/naming-convention */

const MAX_RADIUS = 10;
const MIN_RADIUS = 3;

// Natural Earth 1 projection — trimmed left (before Hawaii), padded right
const SVG_WIDTH = 960;
const SVG_HEIGHT = 460;

const projection = geoNaturalEarth1()
  .scale(170)
  .translate([SVG_WIDTH / 2 - 25, SVG_HEIGHT / 2 + 5]);

const pathGenerator = geoPath(projection);

const geoFeatures = (
  feature(
    worldTopoJson as unknown as Topology,
    (worldTopoJson as unknown as Topology).objects.countries
  ) as GeoJSON.FeatureCollection
).features;

// Inactive country base: dark but visible against the card bg
const INACTIVE_FILL = "#242629";
// Stroke between countries
const BORDER_STROKE = "#3a3c40";
// Info color for active country gradient
const INFO_COLOR = "#63b0bd";

const ResponsiveWorldMap = ({
  mapLocations,
  countryActivity,
  countryMaxCount,
  getRadius
}: {
  mapLocations: TAccessLocation[];
  countryActivity: Map<string, number>;
  countryMaxCount: number;
  getRadius: (count: number) => number;
}) => {
  const [hovered, setHovered] = useState<string | null>(null);

  // Build gradient definitions for each active country
  const activeCountryGradients = useMemo(() => {
    const gradients: { id: string; topOpacity: number; bottomOpacity: number }[] = [];
    countryActivity.forEach((count, numericCode) => {
      const ratio = count / countryMaxCount;
      // Top of gradient is brighter, bottom fades to the base
      const topOpacity = 0.25 + ratio * 0.55; // 0.25 → 0.80
      const bottomOpacity = 0.08 + ratio * 0.15; // 0.08 → 0.23
      gradients.push({ id: numericCode, topOpacity, bottomOpacity });
    });
    return gradients;
  }, [countryActivity, countryMaxCount]);

  const getFill = (id: string, isHover: boolean) => {
    const isActive = countryActivity.has(id);
    if (isHover) {
      return isActive ? `url(#grad-hover-${id})` : "#2f3136";
    }
    return isActive ? `url(#grad-${id})` : INACTIVE_FILL;
  };

  return (
    <div className="w-full overflow-hidden rounded-md border border-border bg-bunker-800/25">
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {activeCountryGradients.map((g) => (
            <linearGradient key={`grad-${g.id}`} id={`grad-${g.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={INFO_COLOR} stopOpacity={g.topOpacity} />
              <stop offset="100%" stopColor={INFO_COLOR} stopOpacity={g.bottomOpacity} />
            </linearGradient>
          ))}
          {activeCountryGradients.map((g) => (
            <linearGradient
              key={`grad-hover-${g.id}`}
              id={`grad-hover-${g.id}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop
                offset="0%"
                stopColor={INFO_COLOR}
                stopOpacity={Math.min(g.topOpacity + 0.15, 1)}
              />
              <stop
                offset="100%"
                stopColor={INFO_COLOR}
                stopOpacity={Math.min(g.bottomOpacity + 0.1, 0.5)}
              />
            </linearGradient>
          ))}
        </defs>
        <g>
          {geoFeatures.map((geo) => {
            const id = String(geo.id ?? "");
            const d = pathGenerator(geo) ?? "";
            const isHover = hovered === id;
            return (
              <path
                key={id}
                d={d}
                fill={getFill(id, isHover)}
                stroke={BORDER_STROKE}
                strokeWidth={0.5}
                onMouseEnter={() => setHovered(id)}
                onMouseLeave={() => setHovered(null)}
                style={{ outline: "none", transition: "fill 0.15s, opacity 0.15s" }}
              />
            );
          })}
        </g>
        <g>
          {mapLocations.map((loc) => {
            const coords = projection([loc.lng, loc.lat]);
            if (!coords) return null;
            return (
              <Tooltip key={`${loc.city}:${loc.country}`}>
                <TooltipTrigger asChild>
                  <circle
                    cx={coords[0]}
                    cy={coords[1]}
                    r={getRadius(loc.count)}
                    fill="color-mix(in srgb, var(--color-warning) 50%, transparent)"
                    stroke="var(--color-warning)"
                    strokeWidth={1}
                    className="cursor-pointer transition-opacity hover:opacity-80"
                  />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-medium">
                    {loc.city ? `${loc.city}, ${loc.country}` : loc.country}
                  </p>
                  <p className="text-xs text-muted">
                    {loc.count.toLocaleString()} access{loc.count !== 1 ? "es" : ""}
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </g>
      </svg>
    </div>
  );
};

export const WorldMap = () => {
  const { projectId } = useProject();

  const { data, isPending } = useGetSecretAccessLocations(
    { projectId, days: 30 },
    { enabled: !!projectId }
  );

  const allLocations = data?.locations ?? [];

  // Separate local network entries from geo-resolvable locations
  const { mapLocations, localCount } = useMemo(() => {
    const geo: TAccessLocation[] = [];
    let local = 0;
    allLocations.forEach((loc) => {
      if (loc.country === "LOCAL") {
        local += loc.count;
      } else {
        geo.push(loc);
      }
    });
    return { mapLocations: geo, localCount: local };
  }, [allLocations]);

  // Aggregate total access count per country (numeric code) for choropleth fill
  const { countryActivity, countryMaxCount } = useMemo(() => {
    const activity = new Map<string, number>();
    mapLocations.forEach((loc) => {
      const numericCode = ALPHA2_TO_NUMERIC[loc.country];
      if (!numericCode) return;
      activity.set(numericCode, (activity.get(numericCode) || 0) + loc.count);
    });
    const maxVal = Math.max(...Array.from(activity.values()), 1);
    return { countryActivity: activity, countryMaxCount: maxVal };
  }, [mapLocations]);

  const maxCount = useMemo(() => Math.max(...mapLocations.map((l) => l.count), 1), [mapLocations]);

  const getRadius = (count: number) => {
    const ratio = count / maxCount;
    return MIN_RADIUS + ratio * (MAX_RADIUS - MIN_RADIUS);
  };

  const totalAccess = allLocations.reduce((sum, l) => sum + l.count, 0);

  return (
    <UnstableCard>
      <UnstableCardHeader>
        <UnstableCardTitle>Secret Access Locations</UnstableCardTitle>
        <UnstableCardDescription>
          Geographic distribution of secret access over the past 30 days
        </UnstableCardDescription>
      </UnstableCardHeader>
      <UnstableCardContent>
        {isPending ? (
          <Skeleton
            className="my-[0.5px] w-full rounded-md"
            style={{ aspectRatio: `${SVG_WIDTH} / ${SVG_HEIGHT}` }}
          />
        ) : (
          <TooltipProvider>
            <ResponsiveWorldMap
              mapLocations={mapLocations}
              countryActivity={countryActivity}
              countryMaxCount={countryMaxCount}
              getRadius={getRadius}
            />
            {totalAccess > 0 && (
              <div className="mt-3 -mb-2 flex flex-wrap items-center gap-3 text-xs">
                {mapLocations.map((loc) => (
                  <span key={`${loc.city}:${loc.country}`} className="text-foreground">
                    <span className="text-muted">
                      {loc.city ? `${loc.city}, ${loc.country}` : loc.country}:
                    </span>{" "}
                    {loc.count.toLocaleString()}
                  </span>
                ))}
                {localCount > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="neutral" className="ml-auto cursor-default">
                        Local Network: {localCount.toLocaleString()}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="font-medium">Local / Private Network</p>
                      <p className="text-xs text-muted">
                        {localCount.toLocaleString()} access{localCount !== 1 ? "es" : ""} from
                        localhost, Docker, or private IP ranges (127.x, 10.x, 192.168.x)
                      </p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}
          </TooltipProvider>
        )}
      </UnstableCardContent>
    </UnstableCard>
  );
};
