import { useState } from "react";
import { useScheme } from "@infisical/cipher/scope";
import { Icon } from "@infisical/cipher/ui/icon";

import styles from "./flows.module.css";

export function ProviderLogo({ image, size = 20 }: { image?: string; size?: number }) {
  const theme = useScheme();
  const onLight = image?.replace(/\.(png|svg)$/, ".on-light.$1");
  const [failed, setFailed] = useState<string[]>([]);
  const candidates = [theme === "light" ? onLight : undefined, image].filter(
    (entry): entry is string => Boolean(entry) && !failed.includes(entry as string)
  );
  if (!candidates.length) return <Icon name="globe" size={size} />;
  return (
    <img
      src={`/images/integrations/${candidates[0]}`}
      alt=""
      width={size}
      height={size}
      className={styles.logo}
      onError={() => setFailed((current) => [...current, candidates[0]])}
    />
  );
}
