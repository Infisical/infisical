import { Badge } from "@infisical/cipher/ui/badge";
import { List, ListRow } from "@infisical/cipher/ui/list";

import type { BillingBands } from "@app/hooks/api/billing/types";

import { bandRangeLabel, bandTableRate, pluralizeUnit } from "../billing-format";

type Props = {
  bands: BillingBands;
  noun: string;
  // The band a free trial's usage has reached, marked "You're here".
  highlight?: number;
};

export const MeteredBandTable = ({ bands, noun, highlight }: Props) => (
  <List variant="divided" size="sm" label="Usage bands">
    {bands.tiers.map((band, index) => {
      const range = `${bandRangeLabel(bands, index)} ${pluralizeUnit(noun)}`;
      return (
        <ListRow
          key={range}
          value={range}
          label={range}
          title={range}
          badge={highlight === index ? <Badge tone="info">You&apos;re here</Badge> : undefined}
          meta={<span className="text-foreground tabular-nums">{bandTableRate(band)}</span>}
        />
      );
    })}
  </List>
);
