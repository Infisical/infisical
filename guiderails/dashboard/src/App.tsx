import { useEffect, useState } from "react";

import { BrowserPane } from "./components/BrowserPane.js";
import { Header } from "./components/Header.js";
import { ProgressFooter } from "./components/ProgressFooter.js";
import { RunTabs } from "./components/RunTabs.js";
import { StepRail } from "./components/StepRail.js";
import { activeRun, useRunStream } from "./useRunStream.js";

export const App = (): JSX.Element => {
  const state = useRunStream();
  /** Null means follow the newest run, which is what an unattended walk should do. */
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const [selectedProcedureIndex, setSelectedProcedureIndex] = useState<number | null>(null);

  const newest = activeRun(state);
  const pinned = pinnedId ? state.runs.find((run) => run.runId === pinnedId) : undefined;
  const run = pinned ?? newest;
  const currentProcedureIndex = run?.currentKey
    ? run.steps.get(run.currentKey)?.procedureIndex
    : undefined;

  useEffect(() => {
    setSelectedProcedureIndex(run?.procedures[0]?.index ?? null);
  }, [run?.runId]);

  useEffect(() => {
    if (currentProcedureIndex !== undefined) setSelectedProcedureIndex(currentProcedureIndex);
  }, [currentProcedureIndex]);

  return (
    <>
      <div className="app">
        <Header state={state} run={run} />
        <BrowserPane
          frame={state.frame}
          baseUrl={run?.baseUrl ?? ""}
          // A frame belongs to whatever is running now, so showing it beside a pinned earlier run
          // would caption someone else's screenshot with the wrong guide.
          stale={Boolean(pinned) && pinned !== newest}
        />
        <StepRail
          run={run}
          live={state.live}
          selectedProcedureIndex={selectedProcedureIndex}
          onSelectProcedure={setSelectedProcedureIndex}
        />
        <ProgressFooter run={run} selectedProcedureIndex={selectedProcedureIndex}>
          <RunTabs
            runs={state.runs}
            activeId={run?.runId ?? ""}
            pinnedId={pinnedId}
            onPin={setPinnedId}
          />
        </ProgressFooter>
      </div>
      {/* Last, and fixed, so it sits over every panel. */}
      <div className="grain" />
    </>
  );
};
