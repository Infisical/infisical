import { renderToStaticMarkup } from "react-dom/server";
import { FormProvider, useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useVercelConnectionListOrganizations } from "@app/hooks/api/appConnections/vercel";
import { SecretSync } from "@app/hooks/api/secretSyncs/enums";
import { VercelSyncScope } from "@app/hooks/api/secretSyncs/types/vercel-sync";

import { TSecretSyncForm } from "../schemas";
import { VercelSyncFields } from "./VercelSyncFields";

vi.mock("@app/components/secret-syncs/forms/SecretSyncConnectionField", () => ({
  SecretSyncConnectionField: () => null
}));
vi.mock("@app/hooks", async () => import("@app/hooks/useDebounce"));
vi.mock("@app/hooks/api/secretSyncs", async () => import("@app/hooks/api/secretSyncs/enums"));
vi.mock("@app/hooks/api/appConnections/vercel", () => ({
  useVercelConnectionListOrganizations: vi.fn()
}));

const queryMock = vi.mocked(useVercelConnectionListOrganizations, { partial: true });

const renderFields = (scope: VercelSyncScope) => {
  const Form = () => {
    const form = useForm<TSecretSyncForm>({
      defaultValues: {
        destination: SecretSync.Vercel,
        connection: { id: "connection-id", name: "Vercel" },
        destinationConfig: { scope, teamId: "", sensitive: false }
      }
    });

    return (
      <FormProvider {...form}>
        <VercelSyncFields />
      </FormProvider>
    );
  };

  return renderToStaticMarkup(<Form />);
};

beforeEach(() => {
  queryMock.mockReset();
});

describe("Vercel destination discovery errors", () => {
  it.each([VercelSyncScope.Project, VercelSyncScope.Team])(
    "shows a loading failure in %s scope without exposing provider details",
    (scope) => {
      queryMock.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error("Provider details containing a private-token")
      });

      const markup = renderFields(scope);

      expect(markup).toContain("Unable to load Vercel teams and projects.");
      expect(markup).toContain('aria-invalid="true"');
      expect(markup).not.toContain("private-token");
    }
  );

  it.each([VercelSyncScope.Project, VercelSyncScope.Team])(
    "does not show a loading failure for an empty successful response in %s scope",
    (scope) => {
      queryMock.mockReturnValue({
        data: [],
        isLoading: false,
        error: null
      });

      const markup = renderFields(scope);

      expect(markup).not.toContain("Unable to load Vercel teams and projects.");
      expect(markup).not.toContain('aria-invalid="true"');
    }
  );
});
