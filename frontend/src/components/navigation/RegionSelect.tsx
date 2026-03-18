import { useLocation } from "@tanstack/react-router";

import { Select, SelectContent, SelectItem, SelectTrigger } from "@app/components/v3";
import { isInfisicalCloud } from "@app/helpers/platform";

enum Region {
  US = "us",
  EU = "eu"
}

const regions = [
  {
    value: Region.US,
    label: "US",
    bullets: [
      "Fastest option if you are based in the US",
      "Data storage compliance for this region",
      "Hosted in Virginia, USA"
    ],
    flag: (
      <svg xmlns="http://www.w3.org/2000/svg" id="flag-icons-us" viewBox="0 0 640 480">
        <path fill="#bd3d44" d="M0 0h640v480H0" />
        <path
          stroke="#fff"
          strokeWidth="37"
          d="M0 55.3h640M0 129h640M0 203h640M0 277h640M0 351h640M0 425h640"
        />
        <path fill="#192f5d" d="M0 0h364.8v258.5H0" />
        <marker id="us-a" markerHeight="30" markerWidth="30">
          <path fill="#fff" d="m14 0 9 27L0 10h28L5 27z" />
        </marker>
        <path
          fill="none"
          markerMid="url(#us-a)"
          d="m0 0 16 11h61 61 61 61 60L47 37h61 61 60 61L16 63h61 61 61 61 60L47 89h61 61 60 61L16 115h61 61 61 61 60L47 141h61 61 60 61L16 166h61 61 61 61 60L47 192h61 61 60 61L16 218h61 61 61 61 60z"
        />
      </svg>
    )
  },
  {
    value: Region.EU,
    label: "EU",
    bullets: [
      "Fastest option if you are based in Europe",
      "Data storage compliance for this region",
      "Hosted in Frankfurt, Germany"
    ],
    flag: (
      <svg xmlns="http://www.w3.org/2000/svg" id="flag-icons-eu" viewBox="0 0 512 512">
        <defs>
          <g id="eu-d">
            <g id="eu-b">
              <path id="eu-a" d="m0-1-.3 1 .5.1z" />
              <use xlinkHref="#eu-a" transform="scale(-1 1)" />
            </g>
            <g id="eu-c">
              <use xlinkHref="#eu-b" transform="rotate(72)" />
              <use xlinkHref="#eu-b" transform="rotate(144)" />
            </g>
            <use xlinkHref="#eu-c" transform="scale(-1 1)" />
          </g>
        </defs>
        <path fill="#039" d="M0 0h512v512H0z" />
        <g fill="#fc0" transform="translate(256 258.4)scale(25.28395)">
          <use xlinkHref="#eu-d" width="100%" height="100%" y="-6" />
          <use xlinkHref="#eu-d" width="100%" height="100%" y="6" />
          <g id="eu-e">
            <use xlinkHref="#eu-d" width="100%" height="100%" x="-6" />
            <use xlinkHref="#eu-d" width="100%" height="100%" transform="rotate(-144 -2.3 -2.1)" />
            <use xlinkHref="#eu-d" width="100%" height="100%" transform="rotate(144 -2.1 -2.3)" />
            <use xlinkHref="#eu-d" width="100%" height="100%" transform="rotate(72 -4.7 -2)" />
            <use xlinkHref="#eu-d" width="100%" height="100%" transform="rotate(72 -5 .5)" />
          </g>
          <use xlinkHref="#eu-e" width="100%" height="100%" transform="scale(-1 1)" />
        </g>
      </svg>
    )
  }
];

type RegionSelectProps = {
  compact?: boolean;
};

export const RegionSelect = ({ compact }: RegionSelectProps) => {
  const location = useLocation();

  const handleRegionSelect = (value: string) => {
    window.location.assign(`https://${value}.infisical.com/${location.pathname}`);
  };

  const shouldDisplay =
    isInfisicalCloud() || window.location.origin.includes("http://localhost:8080");

  // only display region select for cloud
  if (!shouldDisplay) return null;

  const [subdomain] = window.location.host.split(".");
  const currentRegion = subdomain === Region.EU ? regions[1] : regions[0];

  return (
    <div className={compact ? "shrink-0" : "mb-8 flex flex-col items-center"}>
      <Select value={currentRegion.value} onValueChange={handleRegionSelect}>
        <SelectTrigger className={compact ? "w-20 gap-1 px-2" : "w-full max-w-md"}>
          <div className="flex items-center gap-2">
            <div className="h-4 w-5 shrink-0">{currentRegion.flag}</div>
            <span>{currentRegion.label}</span>
          </div>
        </SelectTrigger>
        <SelectContent
          position="popper"
          align="start"
          side="right"
          sideOffset={4}
          className="max-w-md min-w-[var(--radix-select-trigger-width)]"
        >
          {regions.map(({ value, label, bullets, flag }) => (
            <SelectItem
              checkIconClassName="top-3"
              value={value}
              key={value}
              className="overflow-visible whitespace-normal"
            >
              <div className="flex flex-col gap-2 py-1">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-5 shrink-0">{flag}</div>
                  <span className="font-medium">{label}</span>
                </div>
                <ul className="ml-4 flex list-disc flex-col gap-1 text-sm text-mineshaft-300">
                  {bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
