import { type ReactNode, useEffect, useId, useState } from "react";
import { ChevronRightIcon } from "lucide-react";

import { AnimatedCollapse } from "@app/components/v4/ui/animated-collapse";

import { typeSpecimenStyle } from "./foundation-data";

import presentation from "./example-presentation.module.css";
import previewFrame from "./preview-frame.module.css";

export const PageHeading = ({ title }: { title: string }) => (
  <div className="mb-6">
    <h1 className="text-balance [overflow-wrap:anywhere]" style={typeSpecimenStyle("title-lg")}>
      {title}
    </h1>
  </div>
);

export const DocSection = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="mt-11">
    <h2 className="mb-4" style={typeSpecimenStyle("title")}>
      {title}
    </h2>
    {children}
  </section>
);

export const PreviewFrame = ({ children, label }: { children: ReactNode; label?: string }) => (
  <div>
    {label && <h2 className="mb-3 text-sm font-medium">{label}</h2>}
    <div className={`${presentation.frame} ${previewFrame.host}`}>{children}</div>
  </div>
);

export const DocDisclosure = ({
  title,
  children,
  anchor,
  defaultOpen = false,
  className = "mt-8"
}: {
  title: string;
  children: ReactNode;
  anchor?: string;
  defaultOpen?: boolean;
  className?: string;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div id={anchor} className={className}>
      <button
        type="button"
        id={`${id}-trigger`}
        aria-expanded={open}
        aria-controls={`${id}-content`}
        className="flex min-h-9 items-center gap-2 rounded-sm text-sm font-medium"
        onClick={() => setOpen(!open)}
      >
        <ChevronRightIcon
          aria-hidden="true"
          size={16}
          className={`shrink-0 transition-transform duration-(--v4-duration-moderate) ease-(--v4-ease-standard) motion-reduce:transition-none ${open ? "rotate-90" : ""}`}
        />
        {title}
      </button>
      <AnimatedCollapse open={open} lazy id={`${id}-content`} aria-labelledby={`${id}-trigger`}>
        <div className="pt-4">{children}</div>
      </AnimatedCollapse>
    </div>
  );
};

type DetectSummary = { by: string; check?: string; test?: string };

const checkedBy = (detect: DetectSummary) => {
  if (detect.by === "lint") return `Checked by npm run ui:lint (${detect.check}).`;
  if (detect.by === "test") return `Checked by ${detect.test}.`;
  return "Checked in review.";
};

export const RuleMeta = ({ id, detect }: { id: string; detect: DetectSummary }) => (
  <p className="text-muted-foreground mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs leading-5">
    <code>{id}</code>
    <span>{checkedBy(detect)}</span>
  </p>
);

export const useLocationHash = () => {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const follow = () => setHash(window.location.hash);
    window.addEventListener("hashchange", follow);
    return () => window.removeEventListener("hashchange", follow);
  }, []);
  return hash;
};

export const useScrollToAnchor = (anchor: string | undefined) => {
  useEffect(() => {
    if (!anchor) return undefined;
    const frame = requestAnimationFrame(() =>
      document.getElementById(anchor)?.scrollIntoView({ block: "start" })
    );
    return () => cancelAnimationFrame(frame);
  }, [anchor]);
};
