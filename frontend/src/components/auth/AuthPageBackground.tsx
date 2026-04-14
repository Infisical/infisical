/* eslint-disable react/no-array-index-key */
export const AuthPageBackground = () => (
  <div className="pointer-events-none absolute inset-0 flex flex-1 items-center justify-center overflow-hidden">
    <svg
      viewBox="0 0 800 800"
      className="h-[900px] w-[900px] opacity-[0.06]"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="400" cy="400" r="380" stroke="white" strokeWidth="2" />
      <circle cx="400" cy="400" r="370" stroke="white" strokeWidth="0.5" />
      {Array.from({ length: 24 }).map((_, i) => {
        const angle = (i * 15 * Math.PI) / 180;
        const x = 400 + 375 * Math.cos(angle);
        const y = 400 + 375 * Math.sin(angle);
        return <circle key={`bolt-${i}`} cx={x} cy={y} r="4" fill="white" />;
      })}
      <circle cx="400" cy="400" r="300" stroke="white" strokeWidth="1.5" />
      <circle cx="400" cy="400" r="290" stroke="white" strokeWidth="0.5" />
      {Array.from({ length: 60 }).map((_, i) => {
        const angle = (i * 6 * Math.PI) / 180;
        const innerR = i % 5 === 0 ? 280 : 285;
        const x1 = 400 + innerR * Math.cos(angle);
        const y1 = 400 + innerR * Math.sin(angle);
        const x2 = 400 + 290 * Math.cos(angle);
        const y2 = 400 + 290 * Math.sin(angle);
        return (
          <line
            key={`tick-${i}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="white"
            strokeWidth={i % 5 === 0 ? "1.5" : "0.5"}
          />
        );
      })}
      <circle cx="400" cy="400" r="200" stroke="white" strokeWidth="1" />
      <circle cx="400" cy="400" r="195" stroke="white" strokeWidth="0.3" />
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i * 45 * Math.PI) / 180;
        const x1 = 400 + 200 * Math.cos(angle);
        const y1 = 400 + 200 * Math.sin(angle);
        const x2 = 400 + 300 * Math.cos(angle);
        const y2 = 400 + 300 * Math.sin(angle);
        return (
          <line
            key={`spoke-${i}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
          />
        );
      })}
      <circle cx="400" cy="400" r="100" stroke="white" strokeWidth="2" />
      <circle cx="400" cy="400" r="80" stroke="white" strokeWidth="0.5" />
      <circle cx="400" cy="400" r="15" fill="white" />
      <line
        x1="320"
        y1="400"
        x2="480"
        y2="400"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <line
        x1="400"
        y1="320"
        x2="400"
        y2="480"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <line x1="50" y1="50" x2="150" y2="50" stroke="white" strokeWidth="1" />
      <line x1="50" y1="50" x2="50" y2="150" stroke="white" strokeWidth="1" />
      <line x1="750" y1="50" x2="650" y2="50" stroke="white" strokeWidth="1" />
      <line x1="750" y1="50" x2="750" y2="150" stroke="white" strokeWidth="1" />
      <line x1="50" y1="750" x2="150" y2="750" stroke="white" strokeWidth="1" />
      <line x1="50" y1="750" x2="50" y2="650" stroke="white" strokeWidth="1" />
      <line x1="750" y1="750" x2="650" y2="750" stroke="white" strokeWidth="1" />
      <line x1="750" y1="750" x2="750" y2="650" stroke="white" strokeWidth="1" />
    </svg>
  </div>
);
