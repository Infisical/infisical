// import { useMemo } from "react";
// import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RechartsTooltip } from "recharts";

// import {
//   Tooltip,
//   TooltipContent,
//   TooltipTrigger,
//   UnstableCard,
//   UnstableCardContent,
//   UnstableCardDescription,
//   UnstableCardHeader,
//   UnstableCardTitle,
//   UnstableEmpty,
//   UnstableEmptyHeader,
//   UnstableEmptyTitle
// } from "@app/components/v3";
// import type { TExpirationBucket } from "@app/hooks/api/certificates";

// import { CHART_COLORS, CHART_COLORS_HEX } from "./chart-theme";

// type Props = {
//   buckets: TExpirationBucket[];
//   onNavigate: (filters: Record<string, string | undefined>) => void;
// };

// const DONUT_SEGMENTS = [
//   {
//     label: "< 7 days",
//     sourceBuckets: ["expired", "0-7d"],
//     filter: { filterExpiresDays: "7" }
//   },
//   {
//     label: "7-30 days",
//     sourceBuckets: ["8-30d"],
//     filter: { filterExpiresAfterDays: "7", filterExpiresDays: "30" }
//   },
//   {
//     label: "> 30 days",
//     sourceBuckets: ["31-60d", "61-90d", "90d+"],
//     filter: { filterExpiresAfterDays: "30" }
//   }
// ];

// export const ExpirationTimeline = ({ buckets, onNavigate }: Props) => {
//   const bucketMap = useMemo(() => {
//     const map = new Map<string, number>();
//     buckets.forEach((b) => map.set(b.bucket, b.count));
//     return map;
//   }, [buckets]);

//   const chartData = useMemo(
//     () =>
//       DONUT_SEGMENTS.map((seg, idx) => ({
//         label: seg.label,
//         count: seg.sourceBuckets.reduce((sum, key) => sum + (bucketMap.get(key) || 0), 0),
//         color: CHART_COLORS[idx % CHART_COLORS.length],
//         segIdx: idx,
//         filter: seg.filter
//       })),
//     [bucketMap]
//   );

//   const nonZeroData = chartData.filter((d) => d.count > 0);
//   const total = chartData.reduce((sum, d) => sum + d.count, 0);

//   return (
//     <UnstableCard className="flex h-auto min-w-[250px] flex-1 flex-col">
//       <UnstableCardHeader className="pb-0">
//         <UnstableCardTitle className="text-base font-semibold">
//           Expiration Timeline
//         </UnstableCardTitle>
//         <UnstableCardDescription className="text-xs">
//           Certificates by time to expiry
//         </UnstableCardDescription>
//       </UnstableCardHeader>
//       <UnstableCardContent className="flex flex-1 items-center pt-2">
//         {nonZeroData.length === 0 ? (
//           <UnstableEmpty className="h-[200px]">
//             <UnstableEmptyHeader>
//               <UnstableEmptyTitle>No expiration data</UnstableEmptyTitle>
//             </UnstableEmptyHeader>
//           </UnstableEmpty>
//         ) : (
//           <div className="flex w-full items-center gap-3">
//             <div className="w-[120px] shrink-0">
//               <ResponsiveContainer width="100%" height={120}>
//                 <PieChart>
//                   <defs>
//                     {nonZeroData.map((item) => {
//                       const hex = CHART_COLORS_HEX[item.segIdx % CHART_COLORS_HEX.length];
//                       return (
//                         <linearGradient
//                           key={`grad-exp-${item.label}`}
//                           id={`grad-exp-${item.segIdx}`}
//                           x1="0"
//                           y1="0"
//                           x2="1"
//                           y2="1"
//                         >
//                           <stop offset="0%" stopColor={hex} stopOpacity={1} />
//                           <stop offset="100%" stopColor={hex} stopOpacity={0.6} />
//                         </linearGradient>
//                       );
//                     })}
//                   </defs>
//                   <Pie
//                     data={nonZeroData}
//                     dataKey="count"
//                     nameKey="label"
//                     cx="50%"
//                     cy="50%"
//                     innerRadius={32}
//                     outerRadius={52}
//                     paddingAngle={2}
//                     cursor="pointer"
//                     stroke="none"
//                     onClick={(_entry, idx) => {
//                       const item = nonZeroData[idx];
//                       if (item.filter) onNavigate(item.filter);
//                     }}
//                   >
//                     {nonZeroData.map((item) => (
//                       <Cell key={item.label} fill={`url(#grad-exp-${item.segIdx})`} />
//                     ))}
//                   </Pie>
//                   <RechartsTooltip
//                     contentStyle={{
//                       backgroundColor: "var(--color-popover)",
//                       border: "1px solid var(--color-border)",
//                       borderRadius: "6px",
//                       color: "var(--color-foreground)"
//                     }}
//                   />
//                 </PieChart>
//               </ResponsiveContainer>
//             </div>
//             <div className="min-w-0 flex-1">
//               <div className="space-y-1.5">
//                 {chartData.map((item, idx) => {
//                   const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
//                   return (
//                     <button
//                       key={item.label}
//                       type="button"
//                       className="flex w-full cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs transition-colors hover:bg-foreground/5"
//                       onClick={() => {
//                         if (item.filter) onNavigate(item.filter);
//                       }}
//                     >
//                       <span
//                         className="h-2.5 w-2.5 shrink-0 rounded-full"
//                         style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
//                       />
//                       <Tooltip>
//                         <TooltipTrigger asChild>
//                           <span className="min-w-0 flex-1 truncate text-left text-foreground">
//                             {item.label}
//                           </span>
//                         </TooltipTrigger>
//                         <TooltipContent side="top">{item.label}</TooltipContent>
//                       </Tooltip>
//                       <span className="shrink-0 text-right text-muted">{pct}%</span>
//                       <span className="shrink-0 text-right font-medium text-foreground">
//                         {item.count}
//                       </span>
//                     </button>
//                   );
//                 })}
//               </div>
//               <div className="mt-2 flex items-center border-t border-border px-1 pt-2 text-xs">
//                 <span className="flex-1 font-medium text-foreground">Total</span>
//                 <span className="shrink-0 text-right font-semibold text-foreground">{total}</span>
//               </div>
//             </div>
//           </div>
//         )}
//       </UnstableCardContent>
//     </UnstableCard>
//   );
// };
