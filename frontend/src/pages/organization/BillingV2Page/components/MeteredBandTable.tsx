import { Badge } from "@app/components/v3";
import { BillingV2Bands } from "@app/hooks/api";

import { bandRangeLabel, bandTableRate, pluralizeUnit } from "../billing-v2-format";

type Props = {
  bands: BillingV2Bands;
  noun: string;
  // The band a free trial's usage has reached, marked "You're here".
  highlight?: number;
};

// A metered price's bands, one row each: the range with its unit, then the rate.
export const MeteredBandTable = ({ bands, noun, highlight }: Props) => (
  <div className="flex flex-col divide-y divide-border">
    {bands.tiers.map((band, index) => (
      <div
        // eslint-disable-next-line react/no-array-index-key
        key={index}
        className="flex justify-between gap-3 py-2 text-sm tabular-nums"
      >
        <span className="flex items-center gap-2 text-muted">
          {bandRangeLabel(bands, index)} {pluralizeUnit(noun)}
          {highlight === index && <Badge variant="info">You&apos;re here</Badge>}
        </span>
        <span className="text-foreground">{bandTableRate(band)}</span>
      </div>
    ))}
  </div>
);
