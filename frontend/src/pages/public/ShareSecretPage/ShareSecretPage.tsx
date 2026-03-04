import { useState } from "react";
import { Helmet } from "react-helmet";

import { ShareSecretForm } from "./components";

export const ShareSecretPage = () => {
  const [formState, setFormState] = useState<"form" | "link" | "emailed">("form");

  const title = formState === "form" ? "Share a secret" : "Share the link";

  return (
    <>
      <Helmet>
        <title>Securely Share Secrets | Infisical</title>
        <link rel="icon" href="/infisical.ico" />
        <meta property="og:image" content="/images/message.png" />
        <meta property="og:title" content="" />
        <meta name="og:description" content="" />
      </Helmet>
      <div className="dark h-full">
        <div className="relative flex h-screen flex-col justify-between overflow-auto bg-linear-to-tr from-mineshaft-700 to-bunker-800 text-gray-200 dark:scheme-dark">
          {/* Vault door background */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
            <svg
              viewBox="0 0 800 800"
              className="h-[900px] w-[900px] opacity-[0.04]"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Outer vault ring */}
              <circle cx="400" cy="400" r="380" stroke="white" strokeWidth="2" />
              <circle cx="400" cy="400" r="370" stroke="white" strokeWidth="0.5" />

              {/* Bolt circles around the perimeter */}
              {Array.from({ length: 24 }).map((_, i) => {
                const angle = (i * 15 * Math.PI) / 180;
                const x = 400 + 375 * Math.cos(angle);
                const y = 400 + 375 * Math.sin(angle);
                return <circle key={`bolt-${i}`} cx={x} cy={y} r="4" fill="white" />;
              })}

              {/* Middle ring with tick marks */}
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

              {/* Inner mechanism ring */}
              <circle cx="400" cy="400" r="200" stroke="white" strokeWidth="1" />
              <circle cx="400" cy="400" r="195" stroke="white" strokeWidth="0.3" />

              {/* Spokes / locking bars */}
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

              {/* Center handle / wheel */}
              <circle cx="400" cy="400" r="100" stroke="white" strokeWidth="2" />
              <circle cx="400" cy="400" r="80" stroke="white" strokeWidth="0.5" />
              <circle cx="400" cy="400" r="15" fill="white" />

              {/* Handle cross */}
              <line x1="320" y1="400" x2="480" y2="400" stroke="white" strokeWidth="4" strokeLinecap="round" />
              <line x1="400" y1="320" x2="400" y2="480" stroke="white" strokeWidth="4" strokeLinecap="round" />

              {/* Corner reinforcement lines */}
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

          <div />
          <div className="relative z-10 mx-auto w-full max-w-xl px-4 py-4 md:px-0">
            <div className="mb-8 text-center">
              <div className="mb-4 flex justify-center pt-8">
                <a target="_blank" rel="noopener noreferrer" href="https://infisical.com">
                  <img
                    src="/images/gradientLogo.svg"
                    height={90}
                    width={120}
                    alt="Infisical logo"
                    className="cursor-pointer"
                  />
                </a>
              </div>
              <h1 className="mt-8 bg-linear-to-b from-white to-bunker-200 bg-clip-text text-center text-4xl font-medium text-transparent">
                {title}
              </h1>
            </div>
            <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-4">
              <ShareSecretForm isPublic onStateChange={setFormState} />
            </div>
          </div>
          <footer className="relative z-10 py-6 text-center">
            <div className="mb-3 flex items-center justify-center gap-4">
              <a href="https://x.com/infisical" target="_blank" rel="noopener noreferrer" className="text-mineshaft-400 transition-colors hover:text-white">
                <svg className="size-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
              </a>
              <a href="https://www.linkedin.com/company/infisical/" target="_blank" rel="noopener noreferrer" className="text-mineshaft-400 transition-colors hover:text-white">
                <svg className="size-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
              </a>
              <a href="https://www.youtube.com/@infisical_os" target="_blank" rel="noopener noreferrer" className="text-mineshaft-400 transition-colors hover:text-white">
                <svg className="size-4" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>
              </a>
            </div>
            <p className="text-xs text-mineshaft-400">&copy; 2026 Infisical Inc. All rights reserved.</p>
          </footer>
        </div>
      </div>
    </>
  );
};
