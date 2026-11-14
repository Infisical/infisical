import { Button } from "@infisical/cipher/ui/button";
import { Icon, type IconName } from "@infisical/cipher/ui/icon";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { List, ListRow } from "@infisical/cipher/ui/list";
import { Text } from "@infisical/cipher/ui/text";

import { SIGNUP_PRODUCTS, SignupProductType } from "@app/components/auth/signupProducts";
import { getProjectHomePage } from "@app/helpers/project";
import { toV4Href } from "@app/helpers/v4Bridge";
import { submitSignupOnboarding } from "@app/hooks/api/auth/queries";
import { Project, ProjectType } from "@app/hooks/api/projects/types";
import { analytics, AnalyticsEvent, OnboardingResource } from "@app/lib/analytics";

import { productOf } from "../../shell/navigation";
import { AuthPage } from "../components/AuthPage";

const ORG_OVERVIEW = "organization-overview" as const;

const COMMUNITY_LINKS: { label: string; href: string; resource: OnboardingResource }[] = [
  { label: "GitHub", href: "https://github.com/Infisical/infisical", resource: "github" },
  { label: "Discussions", href: "https://community.infisical.com/latest", resource: "discussions" },
  { label: "Videos", href: "https://www.youtube.com/@infisical_os", resource: "youtube" }
];

type Props = {
  orgId: string;
  products: SignupProductType[];
  projects: Partial<Record<SignupProductType, Project>>;
  progress: React.ReactNode;
};

export const CompleteStep = ({ orgId, products, projects, progress }: Props) => {
  const destinationHref = (type: SignupProductType | typeof ORG_OVERVIEW) => {
    if (type === ProjectType.PAM) return toV4Href(`/organizations/${orgId}/pam/access`);
    if (type !== ORG_OVERVIEW) {
      const project = projects[type];
      if (project) {
        return toV4Href(
          getProjectHomePage(project.type, project.environments)
            .replace("$orgId", orgId)
            .replace("$projectId", project.id)
        );
      }
    }
    return toV4Href(`/organizations/${orgId}/projects`);
  };

  const destinations: {
    value: SignupProductType | typeof ORG_OVERVIEW;
    name: string;
    icon: IconName;
  }[] = [
    ...SIGNUP_PRODUCTS.filter((product) => products.includes(product.type)).map((product) => ({
      value: product.type,
      name: product.name,
      icon: productOf(product.type).icon as IconName
    })),
    { value: ORG_OVERVIEW, name: "Organization overview", icon: "apps" }
  ];

  return (
    <AuthPage
      pageTitle="Sign Up"
      title="Your organization is ready"
      progress={progress}
      variant="focused"
      wide
    >
      <List label="Open your workspace">
        {destinations.map((destination) => (
          <ListRow
            key={destination.value}
            value={destination.value}
            label={destination.name}
            title={destination.name}
            media={<Icon name={destination.icon} size={18} />}
            href={destinationHref(destination.value)}
            onClick={() => {
              submitSignupOnboarding({ launchDestination: destination.value }).catch(() => {});
            }}
            actions={<Icon name="chev-right" size={16} />}
          />
        ))}
      </List>
      <Stack gap={8}>
        <Text muted>Additional resources</Text>
        <Inline gap={8}>
          {COMMUNITY_LINKS.map((link) => (
            <Button key={link.label} asChild variant="outline" size="sm" iconRight="external">
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() =>
                  analytics.captureForOrganization(
                    AnalyticsEvent.OnboardingResourceClicked,
                    orgId,
                    { resource: link.resource }
                  )
                }
              >
                {link.label}
              </a>
            </Button>
          ))}
        </Inline>
      </Stack>
    </AuthPage>
  );
};
