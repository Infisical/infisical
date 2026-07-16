import { useFormContext } from "react-hook-form";

import {
  Badge,
  Detail,
  DetailGroup,
  DetailGroupHeader,
  DetailLabel,
  DetailValue
} from "@app/components/v3";

import { HeaderRewritingMode, TProxiedServiceForm } from "./schema";

const NONE = <span className="text-muted italic">None</span>;

export const ProxiedServiceReviewFields = () => {
  const { watch } = useFormContext<TProxiedServiceForm>();
  const { name, hostPattern, isEnabled, headerMode, headers, basicAuth, substitutions } = watch();

  const isBasicAuth = headerMode === HeaderRewritingMode.BasicAuth;
  const activeHeaders = headers.filter((h) => h.headerName && h.secretKey);

  return (
    <div className="mb-4 flex flex-col gap-y-8">
      <DetailGroup>
        <DetailGroupHeader className="border-b border-border pb-2">Details</DetailGroupHeader>
        <div className="flex flex-wrap gap-x-8 gap-y-4">
          <Detail>
            <DetailLabel>Name</DetailLabel>
            <DetailValue>{name}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Host Pattern</DetailLabel>
            <DetailValue className="font-mono">{hostPattern}</DetailValue>
          </Detail>
          <Detail>
            <DetailLabel>Status</DetailLabel>
            <DetailValue>
              <Badge variant={isEnabled ? "success" : "neutral"}>
                {isEnabled ? "Enabled" : "Disabled"}
              </Badge>
            </DetailValue>
          </Detail>
        </div>
      </DetailGroup>

      <DetailGroup>
        <DetailGroupHeader className="border-b border-border pb-2">
          Header Rewrites
        </DetailGroupHeader>
        {isBasicAuth ? (
          <div className="flex flex-wrap gap-x-8 gap-y-4">
            <Detail>
              <DetailLabel>Type</DetailLabel>
              <DetailValue>Basic Auth</DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Username Secret</DetailLabel>
              <DetailValue className="font-mono">
                {basicAuth?.usernameSecretKey || NONE}
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Password Secret</DetailLabel>
              <DetailValue className="font-mono">
                {basicAuth?.passwordSecretKey || NONE}
              </DetailValue>
            </Detail>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {activeHeaders.length === 0
              ? NONE
              : activeHeaders.map((h) => (
                  <div
                    key={`${h.headerName}-${h.secretKey}`}
                    className="flex flex-wrap gap-x-8 gap-y-4"
                  >
                    <Detail>
                      <DetailLabel>Header</DetailLabel>
                      <DetailValue className="font-mono">
                        {h.headerName}
                        {h.headerPrefix ? `: ${h.headerPrefix} …` : ""}
                      </DetailValue>
                    </Detail>
                    <Detail>
                      <DetailLabel>Secret</DetailLabel>
                      <DetailValue className="font-mono">{h.secretKey}</DetailValue>
                    </Detail>
                  </div>
                ))}
          </div>
        )}
      </DetailGroup>

      <DetailGroup>
        <DetailGroupHeader className="border-b border-border pb-2">Substitutions</DetailGroupHeader>
        <div className="flex flex-col gap-3">
          {substitutions.length === 0
            ? NONE
            : substitutions.map((s) => (
                <div
                  key={`${s.placeholderKey}-${s.secretKey}`}
                  className="flex flex-wrap gap-x-8 gap-y-4"
                >
                  <Detail>
                    <DetailLabel>Env Var</DetailLabel>
                    <DetailValue className="font-mono">{s.placeholderKey}</DetailValue>
                  </Detail>
                  <Detail>
                    <DetailLabel>Replace In</DetailLabel>
                    <DetailValue className="capitalize">
                      {s.surfaces.join(", ") || NONE}
                    </DetailValue>
                  </Detail>
                  <Detail>
                    <DetailLabel>Secret</DetailLabel>
                    <DetailValue className="font-mono">{s.secretKey}</DetailValue>
                  </Detail>
                </div>
              ))}
        </div>
      </DetailGroup>
    </div>
  );
};
