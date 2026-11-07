import styles from "../auth.module.css";

const ring = (count: number, radius: number) =>
  Array.from({ length: count }, (_, index) => {
    const angle = (index * 2 * Math.PI) / count;
    return { index, x: 400 + radius * Math.cos(angle), y: 400 + radius * Math.sin(angle), angle };
  });

export const AuthArt = () => (
  <svg viewBox="0 0 800 800" fill="none" aria-hidden="true" className={styles.art}>
    <circle cx="400" cy="400" r="380" stroke="currentColor" strokeWidth="2" />
    <circle cx="400" cy="400" r="370" stroke="currentColor" strokeWidth="0.5" />
    {ring(24, 375).map(({ index, x, y }) => (
      <circle key={`bolt-${index}`} cx={x} cy={y} r="4" fill="currentColor" />
    ))}
    <circle cx="400" cy="400" r="300" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="400" cy="400" r="290" stroke="currentColor" strokeWidth="0.5" />
    {ring(60, 290).map(({ index, angle, x, y }) => {
      const inner = index % 5 === 0 ? 280 : 285;
      return (
        <line
          key={`tick-${index}`}
          x1={400 + inner * Math.cos(angle)}
          y1={400 + inner * Math.sin(angle)}
          x2={x}
          y2={y}
          stroke="currentColor"
          strokeWidth={index % 5 === 0 ? "1.5" : "0.5"}
        />
      );
    })}
    <circle cx="400" cy="400" r="200" stroke="currentColor" strokeWidth="1" />
    <circle cx="400" cy="400" r="195" stroke="currentColor" strokeWidth="0.3" />
    {ring(8, 200).map(({ index, angle, x, y }) => (
      <line
        key={`spoke-${index}`}
        x1={x}
        y1={y}
        x2={400 + 300 * Math.cos(angle)}
        y2={400 + 300 * Math.sin(angle)}
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    ))}
    <circle cx="400" cy="400" r="100" stroke="currentColor" strokeWidth="2" />
    <circle cx="400" cy="400" r="80" stroke="currentColor" strokeWidth="0.5" />
    <circle cx="400" cy="400" r="15" fill="currentColor" />
    <line
      x1="320"
      y1="400"
      x2="480"
      y2="400"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
    />
    <line
      x1="400"
      y1="320"
      x2="400"
      y2="480"
      stroke="currentColor"
      strokeWidth="4"
      strokeLinecap="round"
    />
  </svg>
);
