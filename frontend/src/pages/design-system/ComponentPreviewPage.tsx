import { componentCatalog } from "@app/components/v4/catalog";
import type { ComponentDefinition } from "@app/components/v4/contracts/types";

import {
  DocDisclosure,
  PageHeading,
  RuleMeta,
  useLocationHash,
  useScrollToAnchor
} from "./doc-parts";
import { ExecutableExample, suspendUntilExamplesLoad } from "./example-loader";

const Notes = ({ title, values }: { title: string; values: readonly string[] }) =>
  values.length > 0 ? (
    <section>
      <h2 className="font-medium">{title}</h2>
      <ul className="mt-2 list-disc space-y-2 pl-5">
        {values.map((value) => (
          <li key={value}>{value}</li>
        ))}
      </ul>
    </section>
  ) : null;

const UsageAndRules = ({ definition }: { definition: ComponentDefinition }) => {
  const hash = useLocationHash();
  const linkedRule = definition.guidance.rules.find((rule) => `#rule-${rule.id}` === hash);
  useScrollToAnchor(linkedRule && `rule-${linkedRule.id}`);
  return (
    <DocDisclosure
      key={linkedRule ? `linked:${linkedRule.id}` : "closed"}
      title="Usage and rules"
      defaultOpen={Boolean(linkedRule)}
    >
      <div className="space-y-6 text-sm leading-6">
        <p>{definition.guidance.decision}</p>
        <Notes title="Use" values={definition.guidance.use} />
        <section>
          <h2 className="font-medium">States</h2>
          <dl className="mt-2 space-y-3">
            {definition.guidance.states.map((state) => (
              <div key={state.state}>
                <dt className="font-medium">{state.state}</dt>
                <dd>{state.guidance}</dd>
              </div>
            ))}
          </dl>
        </section>
        <Notes title="Accessibility" values={definition.accessibility} />
        {definition.guidance.rules.map((rule) => (
          <section key={rule.id} id={`rule-${rule.id}`}>
            <h2 className="font-medium">{rule.when}</h2>
            <dl className="mt-2 space-y-2">
              <div>
                <dt className="font-medium">Do</dt>
                <dd>{rule.do}</dd>
              </div>
              <div>
                <dt className="font-medium">Avoid</dt>
                <dd>{rule.avoid}</dd>
              </div>
            </dl>
            <p className="text-muted-foreground mt-3">{rule.reason}</p>
            <RuleMeta id={rule.id} detect={rule.detect} />
          </section>
        ))}
        {definition.guidance.antiSlop.map((rule) => (
          <section key={rule.do}>
            <h2 className="font-medium">{rule.do}</h2>
            <dl className="mt-2">
              <dt className="font-medium">Avoid</dt>
              <dd>{rule.avoid}</dd>
            </dl>
            <p className="text-muted-foreground mt-2">{rule.reason}</p>
          </section>
        ))}
        <Notes title="Avoid" values={definition.guidance.avoid} />
      </div>
    </DocDisclosure>
  );
};

export const ComponentPreviewPage = ({ page }: { page: string }) => {
  const definition = componentCatalog.find((entry) => entry.id === page);
  if (!definition) return <p role="alert">This component has no documentation entry.</p>;
  suspendUntilExamplesLoad(definition.examples);
  return (
    <div>
      <PageHeading title={definition.title} />
      <div className="space-y-8">
        {definition.examples.map((example) => (
          <ExecutableExample
            key={`${definition.id}:${example.id}`}
            example={example}
            componentId={definition.id}
          />
        ))}
      </div>
      <UsageAndRules definition={definition} />
    </div>
  );
};
