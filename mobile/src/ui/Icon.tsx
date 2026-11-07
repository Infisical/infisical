import Svg, { Circle, Path, Rect } from "react-native-svg";

import { iconShapes } from "./icon-data";

export type IconName = keyof typeof iconShapes;

type Props = { name: IconName; size?: number; color: string };

export const Icon = ({ name, size = 18, color }: Props) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
    {iconShapes[name].map((shape, i) => {
      const attributes = shape.attributes as Record<string, string | { strokeWidth: number }>;
      const { style, ...rest } = attributes;
      const strokeWidth = typeof style === "object" ? style.strokeWidth : undefined;
      if (shape.tag === "circle") return <Circle key={i} {...(rest as object)} strokeWidth={strokeWidth} />;
      if (shape.tag === "rect") return <Rect key={i} {...(rest as object)} strokeWidth={strokeWidth} />;
      return <Path key={i} {...(rest as object)} strokeWidth={strokeWidth} />;
    })}
  </Svg>
);
