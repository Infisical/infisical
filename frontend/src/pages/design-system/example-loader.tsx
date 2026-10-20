import {
  Component,
  type ComponentType,
  lazy,
  type ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import { type ComponentExampleDefinition } from "@app/components/v4/contracts/types";

import { PreviewFrame } from "./doc-parts";

type ExampleLoader = () => Promise<{ default: ComponentType }>;

const modules: Readonly<Record<string, ExampleLoader>> = import.meta.glob<{
  default: ComponentType;
}>(["./examples/**/*.tsx", "!./examples/**/*.{test,spec}.tsx"]);
const loaded = new Map<string, ComponentType>();
const failedImports = new Set<string>();

const recordImport = (module: string, loader: ExampleLoader) => () =>
  loader().then(
    (exports) => {
      failedImports.delete(module);
      return exports;
    },
    (error: unknown) => {
      failedImports.add(module);
      throw error;
    }
  );
const settled = new Set<string>();
const pending = new Map<string, Promise<void>>();

const prefetch = (module: string) => {
  const loader = modules[module];
  if (!loader || settled.has(module)) return null;
  const known = pending.get(module);
  if (known) return known;
  const request = recordImport(module, loader)()
    .then((exports) => {
      loaded.set(module, exports.default);
    })
    .catch(() => undefined)
    .finally(() => {
      settled.add(module);
      pending.delete(module);
    });
  pending.set(module, request);
  return request;
};

export const suspendUntilExamplesLoad = (examples: readonly ComponentExampleDefinition[]) => {
  const waiting = examples.map((example) => prefetch(example.module)).filter(Boolean);
  if (waiting.length > 0) throw Promise.all(waiting);
};

class ExampleBoundary extends Component<
  { children: ReactNode; onRetry: () => void; onError: () => void },
  { failed: boolean }
> {
  constructor(props: { children: ReactNode; onRetry: () => void; onError: () => void }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    const { onError } = this.props;
    onError();
  }

  render() {
    const { failed } = this.state;
    const { onRetry, children } = this.props;
    if (failed)
      return (
        <div role="alert">
          <p>This example could not render. Check the browser console.</p>
          <p>Trying again resets local example state.</p>
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        </div>
      );
    return children;
  }
}

const Mounted = ({ onMount }: { onMount: () => void }) => {
  useEffect(onMount, [onMount]);
  return null;
};

export const ExecutableExample = ({
  example,
  componentId,
  loaders = modules
}: {
  example: ComponentExampleDefinition;
  componentId: string;
  loaders?: Readonly<Record<string, ExampleLoader>>;
}) => {
  const loader = loaders[example.module];
  const [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const [state, setState] = useState<{
    module: string;
    attempt: number;
    status: "loading" | "mounted" | "error";
  }>({ module: example.module, attempt: 0, status: "loading" });
  const mounted = useCallback(
    () => setState({ module: example.module, attempt, status: "mounted" }),
    [example.module, attempt]
  );
  const failed = useCallback(
    () => setState({ module: example.module, attempt, status: "error" }),
    [example.module, attempt]
  );
  const Render = useMemo(() => {
    const ready = attempt === 0 ? loaded.get(example.module) : undefined;
    if (ready) return ready;
    return loader ? lazy(recordImport(example.module, loader)) : null;
  }, [example.module, loader, attempt]);
  useEffect(() => {
    if (attempt > 0) heading.current?.focus();
  }, [attempt]);
  if (!Render)
    return (
      <section data-component={componentId} data-example={example.id} data-example-state="error">
        <p role="alert">Missing example module: {example.module}</p>
      </section>
    );
  return (
    <section
      aria-labelledby={`${componentId}-${example.id}-title`}
      data-component={componentId}
      data-example={example.id}
      data-example-state={
        state.module === example.module && state.attempt === attempt ? state.status : "loading"
      }
    >
      <h2
        ref={heading}
        id={`${componentId}-${example.id}-title`}
        tabIndex={-1}
        className="mb-3 text-sm font-medium"
      >
        {example.title}
      </h2>
      <PreviewFrame>
        <ExampleBoundary
          key={`${componentId}:${example.id}:${example.module}:${attempt}`}
          onError={failed}
          onRetry={() => {
            if (failedImports.has(example.module)) window.location.reload();
            else setAttempt((current) => current + 1);
          }}
        >
          <Suspense fallback={<p role="status">Loading example</p>}>
            <div className="w-full max-w-full min-w-0">
              <Render />
            </div>
            <Mounted onMount={mounted} />
          </Suspense>
        </ExampleBoundary>
      </PreviewFrame>
    </section>
  );
};
