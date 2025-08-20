import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from "recharts";

export const ReactChart = ({ logs }: { logs: { createdAt: string }[] }) => {
  const HOURS_TO_DISPLAY = 24;

  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setSeconds(0, 0);
  now.setMilliseconds(0);

  const startOfChartPeriod = new Date(now);
  startOfChartPeriod.setHours(startOfChartPeriod.getHours() - (HOURS_TO_DISPLAY - 1));
  const startOfChartPeriodMs = startOfChartPeriod.getTime();
  const endOfChartPeriodMs = now.getTime();

  const hourlyCounts = new Map<number, number>();

  const chartData: { time: string; count: number }[] = [];
  for (let i = 0; i < HOURS_TO_DISPLAY; i++) {
    const currentHourMs = startOfChartPeriodMs + i * 60 * 60 * 1000;

    hourlyCounts.set(currentHourMs, 0);
    chartData.push({
      time: new Date(currentHourMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      count: 0
    });
  }

  for (const log of logs) {
    const logDate = new Date(log.createdAt);

    if (isNaN(logDate.getTime())) {
      console.warn("Invalid createdAt date found in logs:", log.createdAt);
      continue;
    }

    const logHourStart = new Date(
      logDate.getFullYear(),
      logDate.getMonth(),
      logDate.getDate(),
      logDate.getHours()
    );
    const logHourStartMs = logHourStart.getTime();

    if (logHourStartMs >= startOfChartPeriodMs && logHourStartMs <= endOfChartPeriodMs) {
      if (hourlyCounts.has(logHourStartMs)) {
        hourlyCounts.set(logHourStartMs, hourlyCounts.get(logHourStartMs)! + 1);
      }
    }
  }

  for (let i = 0; i < chartData.length; i++) {
    const currentHourMs = startOfChartPeriodMs + i * 60 * 60 * 1000;
    chartData[i].count = hourlyCounts.get(currentHourMs) || 0;
  }

  return (
    <ResponsiveContainer>
      <LineChart data={chartData} margin={{ left: -20 }}>
        <CartesianGrid className="bg-mineshaft-400 stroke-mineshaft-700" />
        <XAxis dataKey="time" tick={{ className: "text-xs" }} interval={1} />
        <YAxis
          allowDecimals={false}
          label={{
            value: "Count",
            angle: -90,
            position: "left",
            className: "text-xs",
            offset: -30
          }}
          tick={{ className: "text-xs" }}
        />
        <Tooltip
          labelStyle={{ fontSize: "12px", color: "#707174" }}
          itemStyle={{ fontSize: "12px", color: "#FFFFFF" }}
          contentStyle={{
            backgroundColor: "#26272b",
            borderRadius: "4px",
            border: "1px solid #323439",
            borderColor: "#323439",
            padding: "6px 8px 4px 8px"
          }}
          isAnimationActive={false}
        />
        <Line
          dataKey="count"
          stroke="#e0ed34"
          name="Requests"
          dot={false}
          activeDot={{ fill: "#323439" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};
