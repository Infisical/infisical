import { createNotification } from "@app/components/notifications";

export const createIntegrationMissingEnvVarsNotification = (
  slug: string,
  type: "cloud" | "cicd" = "cloud",
  hashtag?: string
) =>
  createNotification({
    type: "error",
    text: (
      <a
        href={`https://infisical.com/docs/integrations/${type}/${slug}${
          hashtag ? `#${hashtag}` : ""
        }`}
        target="_blank"
        rel="noreferrer"
        className="underline"
      >
        Click here to view docs
      </a>
    ),
    title: "Missing Environment Variables"
  });
