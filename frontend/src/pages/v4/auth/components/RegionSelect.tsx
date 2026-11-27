import { Select } from "@infisical/cipher/ui/select";
import { useLocation } from "@tanstack/react-router";

import { isInfisicalCloud } from "@app/helpers/platform";

import styles from "../auth.module.css";

const REGIONS = [
  { value: "us", label: "US", description: "Hosted in Virginia, USA" },
  { value: "eu", label: "EU", description: "Hosted in Frankfurt, Germany" }
];

export const RegionSelect = () => {
  const location = useLocation();
  if (!isInfisicalCloud() && !window.location.origin.includes("http://localhost:8080")) return null;

  const [subdomain] = window.location.host.split(".");
  const current = subdomain === "eu" ? "eu" : "us";

  const handleRegionSelect = (value: string) => {
    const currentSearch = new URLSearchParams(window.location.search);
    const trialSearch = new URLSearchParams(
      ["product", "plan", "cycle"].flatMap((key) => {
        const param = currentSearch.get(key);
        return param ? [[key, param]] : [];
      })
    ).toString();
    window.location.assign(
      `https://${value}.infisical.com/${location.pathname}${trialSearch ? `?${trialSearch}` : ""}`
    );
  };

  return (
    <span className={styles.region}>
      <Select
        aria-label="Region"
        size="sm"
        align="end"
        value={current}
        onValueChange={handleRegionSelect}
        options={REGIONS}
      />
    </span>
  );
};
