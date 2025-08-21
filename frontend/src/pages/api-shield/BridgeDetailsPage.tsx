import { useState } from "react";
import { Helmet } from "react-helmet";
import {
  faWandSparkles,
  faLightbulb,
  faTimes,
  faWandMagicSparkles
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useParams } from "@tanstack/react-router";

import { EmptyState, PageHeader, Button, Input, FormControl } from "@app/components/v2";
import { createNotification } from "@app/components/notifications";
import { Timezone } from "@app/helpers/datetime";
import {
  bridgeQueryKeys,
  useUpdateBridge,
  BridgeRuleOperator,
  TBridgeRule
} from "@app/hooks/api/bridge";

import { BridgeRequestsTable } from "./BridgeDetailsPage/components/BridgeRequestsTable";
import { ReactChart } from "./BridgeDetailsPage/components/RequestChart";
import ReactMarkdown from "react-markdown";
import { useWorkspace } from "@app/context";

const FIELD_OPTIONS = [
  { label: "Request Method", value: "requestMethod" },
  { label: "URL", value: "uriPath" },
  { label: "User Agent", value: "userAgent" },
  { label: "IP", value: "ip" },
  { label: "Query String", value: "queryString" },
  { label: "Role", value: "role" }
];

const OPERATOR_OPTIONS = [
  { label: "Equal", value: BridgeRuleOperator.EQ },
  { label: "Not Equals", value: BridgeRuleOperator.NEQ },
  { label: "Contains", value: BridgeRuleOperator.CONTAINS },
  { label: "Not Contains", value: BridgeRuleOperator.NOT_CONTAINS },
  { label: "Ends With", value: BridgeRuleOperator.ENDS_WITH },
  { label: "Not Ends With", value: BridgeRuleOperator.NOT_ENDS_WITH },
  { label: "Starts With", value: BridgeRuleOperator.STARTS_WITH },
  { label: "Not Starts With", value: BridgeRuleOperator.NOT_STARTS_WITH },
  { label: "Is In", value: BridgeRuleOperator.IN },
  { label: "Wildcard", value: BridgeRuleOperator.WILDCARD }
];

const PreviewRuleSetEditor = ({
  ruleSetIndex,
  rules
}: {
  ruleSetIndex: number;
  rules: TBridgeRule[];
}) => (
  <div className="space-y-2 opacity-75">
    {rules.map((rule, ruleIndex) => (
      <div key={`preview-rule-${ruleIndex + 1}`}>
        <div className="flex items-center space-x-2">
          <FormControl
            label={ruleIndex === 0 && ruleSetIndex == 0 ? "Field" : undefined}
            className="my-0 w-40"
          >
            <Input
              value={FIELD_OPTIONS.find((op) => op.value === rule.field)?.label || rule.field}
              disabled
              className="bg-mineshaft-700 text-mineshaft-300"
            />
          </FormControl>
          <FormControl
            label={ruleIndex === 0 && ruleSetIndex == 0 ? "Operator" : undefined}
            className="my-0 w-40"
          >
            <Input
              value={
                OPERATOR_OPTIONS.find((op) => op.value === rule.operator)?.label || rule.operator
              }
              disabled
              className="bg-mineshaft-700 text-mineshaft-300"
            />
          </FormControl>
          <FormControl
            label={ruleIndex === 0 && ruleSetIndex == 0 ? "Value" : undefined}
            className="my-0 flex-1"
          >
            <Input value={rule.value} disabled className="bg-mineshaft-700 text-mineshaft-300" />
          </FormControl>
        </div>
        {ruleIndex + 1 !== rules.length && (
          <div className="relative ml-2 mt-2 w-min rounded bg-mineshaft-600 px-2 py-1 text-xs text-mineshaft-300">
            <div className="absolute -top-2 right-1/2 h-2 w-1 translate-x-1/2 bg-mineshaft-600" />
            And
            <div className="absolute -bottom-2 right-1/2 h-2 w-1 translate-x-1/2 bg-mineshaft-600" />
          </div>
        )}
      </div>
    ))}
  </div>
);

export const BridgeDetailsPage = () => {
  const { currentWorkspace } = useWorkspace();
  const [showSuggestion, setShowSuggestion] = useState(false);

  const bridgeId = useParams({
    from: "/_authenticate/_inject-org-details/_org-layout/projects/api-shield/$projectId/_api-shield-layout/bridge/$bridgeId",
    select: (el) => el.bridgeId
  });

  const { data: bridgeDetails } = useQuery({
    ...bridgeQueryKeys.byId(bridgeId),
    enabled: Boolean(bridgeId)
  });

  const { data: bridgeRequests, isPending: isRequestsLoading } = useQuery({
    ...bridgeQueryKeys.listRequest(bridgeId),
    enabled: Boolean(bridgeId)
  });

  const { mutateAsync: updateBridge } = useUpdateBridge();

  const handleApplyRules = async () => {
    if (!bridgeDetails?.dailySuggestionRuleSet) return;

    try {
      await updateBridge({
        id: bridgeId,
        ruleSet: bridgeDetails.dailySuggestionRuleSet
      });

      createNotification({
        type: "success",
        text: "Suggested rules applied successfully!"
      });

      setShowSuggestion(false);
    } catch (err) {
      console.error(err);
      createNotification({
        type: "error",
        text: "Failed to apply suggested rules"
      });
    }
  };

  return (
    <div className="container mx-auto flex flex-col justify-between bg-bunker-800 text-white">
      <Helmet>
        <title>External API Details</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-7xl px-6">
          <PageHeader title={bridgeDetails?.slug || "External API Details"} />

          {bridgeDetails?.dailySuggestionText && !showSuggestion && (
            <div className="mt-4 rounded-lg border border-yellow-600 bg-yellow-900/20 p-4">
              <div className="flex items-center justify-between">
                <div className="flex gap-3">
                  <FontAwesomeIcon icon={faWandMagicSparkles} className="mt-1 text-yellow-400" />
                  <div>
                    <h4 className="font-semibold text-yellow-100">AI Rule Suggestion</h4>
                    <span className="text-sm text-yellow-200">
                      <ReactMarkdown>{bridgeDetails.dailySuggestionText}</ReactMarkdown>
                    </span>
                  </div>
                </div>

                <Button size="sm" onClick={() => setShowSuggestion(true)} className="ml-3">
                  View Suggestion
                </Button>
              </div>
            </div>
          )}
          {showSuggestion && bridgeDetails?.dailySuggestionText && (
            <div className="mt-4 flex flex-col gap-2 rounded-lg border border-yellow-600 bg-yellow-900/20 p-4">
              <div className="flex items-center">
                <div className="flex gap-3">
                  <FontAwesomeIcon icon={faWandMagicSparkles} className="mt-1 text-yellow-400" />
                  <h3 className="text-lg font-medium text-mineshaft-100">AI Rule Suggestion</h3>
                </div>
              </div>

              <span className="text-sm text-yellow-200">
                <ReactMarkdown>{bridgeDetails.dailySuggestionText}</ReactMarkdown>
              </span>

              {bridgeDetails.dailySuggestionRuleSet &&
                bridgeDetails.dailySuggestionRuleSet.length > 0 && (
                  <div className="space-y-4">
                    <div className="space-y-2 rounded border border-mineshaft-500 bg-mineshaft-800 p-4">
                      {bridgeDetails.dailySuggestionRuleSet.map((ruleSet, ruleSetIndex) => (
                        <div key={`suggested-rule-${ruleSetIndex + 1}`}>
                          <div className="mb-2">
                            <PreviewRuleSetEditor ruleSetIndex={ruleSetIndex} rules={ruleSet} />
                          </div>
                          {ruleSetIndex + 1 !== bridgeDetails.dailySuggestionRuleSet!.length && (
                            <div className="relative ml-2 mt-2 w-min rounded bg-mineshaft-600 px-2 py-1 text-xs text-mineshaft-300">
                              Or
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center justify-end gap-3">
                      <Button
                        size="sm"
                        variant="outline_bg"
                        onClick={() => setShowSuggestion(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleApplyRules}
                        className="bg-primary text-black hover:bg-primary/90"
                        leftIcon={<FontAwesomeIcon icon={faWandMagicSparkles} />}
                      >
                        Apply Rules
                      </Button>
                    </div>
                  </div>
                )}
            </div>
          )}

          <div className="mt-6">
            <div className="flex gap-4">
              <div className="h-min max-w-xs flex-shrink-0 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
                <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
                  <h3 className="text-lg font-semibold text-mineshaft-100">External API Details</h3>
                </div>
                <div className="pt-4">
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-mineshaft-300">External API Slug</p>
                    <div className="group flex align-top">
                      <p className="text-sm text-mineshaft-300">{bridgeDetails?.slug}</p>
                    </div>
                  </div>
                </div>
                <div className="mb-4">
                  <p className="text-sm font-semibold text-mineshaft-300">Project Slug</p>
                  <p className="truncate text-sm text-mineshaft-300">{currentWorkspace.slug}</p>
                </div>
                <div className="mb-4">
                  <p className="text-sm font-semibold text-mineshaft-300">Base URL</p>
                  <p className="truncate text-sm text-mineshaft-300">{bridgeDetails?.baseUrl}</p>
                </div>
                <div className="mb-4">
                  <p className="text-sm font-semibold text-mineshaft-300">OpenAPI URL</p>
                  <p className="truncate text-sm text-mineshaft-300">{bridgeDetails?.openApiUrl}</p>
                </div>
              </div>
              <div className="flex-grow">
                <BridgeRequestsTable
                  bridgeDetails={bridgeDetails}
                  bridgeRequests={bridgeRequests || []}
                  isLoading={isRequestsLoading}
                  timezone={Timezone.UTC}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/api-shield/$projectId/_api-shield-layout/bridge/$bridgeId"
)({
  component: BridgeDetailsPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Bridge Details"
        }
      ]
    };
  }
});
