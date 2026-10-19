import * as React from "react";

export type OptionCreateHandler = (
  query: string,
  context: { signal: AbortSignal }
) => void | Promise<void>;
export function useOptionCreation(
  onCreate: OptionCreateHandler | undefined,
  onSuccess: () => void
) {
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState("");
  const generation = React.useRef(0);
  const request = React.useRef<AbortController | null>(null);
  const cancel = React.useCallback(() => {
    generation.current += 1;
    request.current?.abort();
    request.current = null;
    setCreating(false);
    setError("");
  }, []);
  React.useEffect(
    () => () => {
      generation.current += 1;
      request.current?.abort();
    },
    []
  );
  const create = async (query: string) => {
    if (!onCreate) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    generation.current += 1;
    const turn = generation.current;
    setCreating(true);
    setError("");
    try {
      await onCreate(query, { signal: controller.signal });
      if (turn === generation.current && !controller.signal.aborted) onSuccess();
    } catch (cause) {
      const aborted = cause instanceof DOMException && cause.name === "AbortError";
      if (turn === generation.current && !controller.signal.aborted && !aborted)
        setError("Could not create this option. Try again.");
    } finally {
      if (turn === generation.current) {
        request.current = null;
        setCreating(false);
      }
    }
  };
  return { creating, error, create, cancel };
}
