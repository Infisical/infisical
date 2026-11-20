import { ChartContainer } from "@infisical/cipher/ui/chart";
import { Area, AreaChart, YAxis } from "recharts";

import type { HomeDay } from "../../data/home/contract";

import styles from "./MetricTile.module.css";

const BleedChart = ({ days, label, step }: { days: HomeDay[]; label: string; step?: boolean }) => {
  const values = days.map((day) => day.value);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const floor = max === min ? min - 1 : min - ((max - min) * 6) / 74;
  return (
    <ChartContainer
      config={{ value: { label, color: "var(--cipher-hue-icon)" } }}
      height={92}
      className={styles.chartContainer}
    >
      <AreaChart data={days} margin={{ top: 12, right: 0, bottom: 0, left: 0 }}>
        <YAxis hide type="number" allowDataOverflow domain={[floor, max === min ? max + 1 : max]} />
        <Area
          dataKey="value"
          type={step ? "stepAfter" : "linear"}
          stroke="var(--cipher-hue-icon)"
          strokeWidth={1.6}
          fill="var(--cipher-hue-fill)"
          fillOpacity={0.14}
          baseValue={floor}
          dot={false}
          activeDot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  );
};

export default BleedChart;
