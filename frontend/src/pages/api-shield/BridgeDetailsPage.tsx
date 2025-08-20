import { useState } from "react";
import { Helmet } from "react-helmet";
import { faWandSparkles, faLightbulb, faTimes } from "@fortawesome/free-solid-svg-icons";
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
    <div className="mb-4 flex items-center justify-between">
      <h3 className="text-lg font-medium text-mineshaft-100">Rule Set {ruleSetIndex + 1}</h3>
      <div className="text-xs text-mineshaft-400">Preview (AI Suggested)</div>
    </div>
    {rules.map((rule, ruleIndex) => (
      <div key={`preview-rule-${ruleIndex + 1}`}>
        <div className="flex items-center space-x-2">
          <FormControl label={ruleIndex === 0 ? "Field" : undefined} className="my-0 w-40">
            <Input
              value={FIELD_OPTIONS.find((op) => op.value === rule.field)?.label || rule.field}
              disabled
              className="bg-mineshaft-700 text-mineshaft-300"
            />
          </FormControl>
          <FormControl label={ruleIndex === 0 ? "Operator" : undefined} className="my-0 w-40">
            <Input
              value={
                OPERATOR_OPTIONS.find((op) => op.value === rule.operator)?.label || rule.operator
              }
              disabled
              className="bg-mineshaft-700 text-mineshaft-300"
            />
          </FormControl>
          <FormControl label={ruleIndex === 0 ? "Value" : undefined} className="my-0 flex-1">
            <Input value={rule.value} disabled className="bg-mineshaft-700 text-mineshaft-300" />
          </FormControl>
        </div>
        {ruleIndex + 1 !== rules.length && (
          <div className="relative mt-2 w-min border border-mineshaft-600 px-2 py-1 text-mineshaft-400">
            <div className="absolute -top-2 left-1/2 h-2 w-1 bg-mineshaft-600" />
            AND
            <div className="absolute -bottom-2 left-1/2 h-2 w-1 bg-mineshaft-600" />
          </div>
        )}
      </div>
    ))}
  </div>
);

export const BridgeDetailsPage = () => {
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
        <title>Bridge Details</title>
        <link rel="icon" href="/infisical.ico" />
      </Helmet>
      <div className="flex h-full w-full justify-center bg-bunker-800 text-white">
        <div className="w-full max-w-7xl px-6">
          <PageHeader
            title="Bridge Details Page"
            description="Detail insights into your projects"
          />

          {bridgeDetails?.dailySuggestionText && !showSuggestion && (
            <div className="mt-4 rounded-lg border border-yellow-600 bg-yellow-900/20 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <FontAwesomeIcon icon={faLightbulb} className="text-yellow-400" />
                  <div>
                    <h4 className="font-semibold text-yellow-100">New Suggestion Available</h4>
                    <p className="text-sm text-yellow-200">
                      We have generated new rule suggestions based on recent traffic patterns.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline_bg" onClick={() => setShowSuggestion(true)}>
                    View Suggestion
                  </Button>
                </div>
              </div>
            </div>
          )}
          {showSuggestion && bridgeDetails?.dailySuggestionText && (
            <div className="mt-4 space-y-6 rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-6">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium text-mineshaft-100">AI Rule Suggestion</h3>
                <Button
                  size="sm"
                  variant="outline_bg"
                  onClick={() => setShowSuggestion(false)}
                  leftIcon={<FontAwesomeIcon icon={faTimes} />}
                >
                  Close
                </Button>
              </div>
              <div className="rounded border border-mineshaft-600 bg-mineshaft-900 p-4">
                <h4 className="mb-2 text-sm font-semibold text-mineshaft-300">
                  Suggestion Details
                </h4>
                <div className="whitespace-pre-wrap text-sm text-mineshaft-100">
                  {bridgeDetails.dailySuggestionText}
                </div>
              </div>

              {bridgeDetails.dailySuggestionRuleSet &&
                bridgeDetails.dailySuggestionRuleSet.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-lg font-medium text-mineshaft-100">
                        Suggested Rules Preview
                      </h4>
                      <div className="text-sm text-mineshaft-400">
                        {bridgeDetails.dailySuggestionRuleSet.length} rule set
                        {bridgeDetails.dailySuggestionRuleSet.length > 1 ? "s" : ""} suggested
                      </div>
                    </div>

                    <div className="space-y-2">
                      {bridgeDetails.dailySuggestionRuleSet.map((ruleSet, ruleSetIndex) => (
                        <div key={`suggested-rule-${ruleSetIndex + 1}`}>
                          <div className="mb-2 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
                            <PreviewRuleSetEditor ruleSetIndex={ruleSetIndex} rules={ruleSet} />
                          </div>
                          {ruleSetIndex + 1 !== bridgeDetails.dailySuggestionRuleSet!.length && (
                            <div className="relative w-min border border-mineshaft-600 px-2 py-1 text-mineshaft-400">
                              <div className="absolute -top-2 left-1/2 h-2 w-1 bg-mineshaft-600" />
                              OR
                              <div className="absolute -bottom-2 left-1/2 h-2 w-1 bg-mineshaft-600" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-center border-t border-mineshaft-600 pt-6">
                      <Button
                        onClick={handleApplyRules}
                        className="bg-primary text-black hover:bg-primary/90"
                      >
                        Apply Suggested Rules
                      </Button>
                    </div>
                  </div>
                )}
            </div>
          )}

          <div className="mt-6">
            <div className="flex gap-2">
              <div className="h-min max-w-xs flex-shrink-0 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
                <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
                  <h3 className="text-lg font-semibold text-mineshaft-100">Bridge Details</h3>
                </div>
                <div className="pt-4">
                  <div className="mb-4">
                    <p className="text-sm font-semibold text-mineshaft-300">Bridge Slug</p>
                    <div className="group flex align-top">
                      <p className="text-sm text-mineshaft-300">{bridgeDetails?.slug}</p>
                    </div>
                  </div>
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
                <div className="mb-4 w-full rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
                  <div className="flex items-center justify-between border-b border-mineshaft-400 pb-4">
                    <h3 className="text-lg font-semibold text-mineshaft-100">Daily Insights</h3>
                  </div>
                  <div className="pt-2">
                    {bridgeDetails?.dailyInsightText ? (
                      <div className="whitespace-pre-wrap text-sm text-mineshaft-100">
                        {bridgeDetails.dailyInsightText}
                      </div>
                    ) : (
                      <EmptyState title="No daily insight" icon={faWandSparkles} />
                    )}
                  </div>
                  {bridgeRequests && (
                    <div className="mt-6 h-[300px] w-full">
                      <ReactChart logs={bridgeRequests} />
                    </div>
                  )}
                </div>
                <BridgeRequestsTable
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
