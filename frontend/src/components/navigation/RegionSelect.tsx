import { useRouter } from "next/router";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { Modal, ModalContent, ModalTrigger, Select, SelectItem } from "@app/components/v2";

enum Region {
  US = "us",
  EU = "eu"
}

const regions = [
  {
    value: Region.US,
    label: "United States",
    location: "Virginia, USA",
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
    label: "Europe",
    location: "Frankfurt, Germany",
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

export const RegionSelect = () => {
  const router = useRouter();

  const handleRegionSelect = (value: Region) => {
    router.push(`https://${value}.infisical.com/${router.pathname}`);
  };

  const [subdomain, domain] = window.location.host.split(".");

  // only display region select for cloud
  if (!domain?.match(/infisical/)) return null;

  // default to US if not eu
  const currentRegion = subdomain === Region.EU ? regions[1] : regions[0];

  return (
    <div className="mb-8 flex flex-col items-center">
      <Select
        className="w-44"
        onValueChange={handleRegionSelect}
        defaultValue={currentRegion.value}
      >
        {regions.map(({ value, label, flag }) => (
          <SelectItem value={value} key={value}>
            <div className="flex items-center gap-2">
              <div className="w-4">{flag}</div>
              {label}
            </div>
          </SelectItem>
        ))}
      </Select>
      <Modal>
        <ModalTrigger>
          <button type="button" className="mt-1 text-right text-xs text-mineshaft-400 underline">
            Help me pick a data region
          </button>
        </ModalTrigger>
        <ModalContent
          title="Infisical Cloud data regions"
          subTitle="Select the closest region to you and your team. Contact Infisical if you need to migrate regions."
        >
          {regions.map(({ value, label, location, flag }) => (
            <div className="mb-6" key={value}>
              <p className="font-medium">
                <span className="mr-2 inline-block w-4">{flag}</span>
                {value.toUpperCase()} Region
              </p>
              <ul className="ml-6 mt-2 flex flex-col gap-1">
                <li>
                  <FontAwesomeIcon size="xs" className="mr-0.5 text-green" icon={faCheck} /> Fastest
                  option if you are based in {value === Region.US ? "the" : ""} {label}
                </li>
                <li>
                  <FontAwesomeIcon size="xs" className="mr-0.5 text-green" icon={faCheck} /> Data
                  storage compliance for this region
                </li>
                <li>
                  <FontAwesomeIcon size="xs" className="mr-0.5 text-green" icon={faCheck} /> Hosted
                  in {location}
                </li>
              </ul>
            </div>
          ))}
        </ModalContent>
      </Modal>
    </div>
  );
};
