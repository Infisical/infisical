export type TIntegrationCredentialsProps = {
  slack: { clientId: string; clientSecret: string };
  microsoftTeams: { appId: string; clientSecret: string; botId: string };
  gitHubAppConnection: { clientId: string; clientSecret: string; appSlug: string; appId: string; privateKey: string };
};

// The instance's app credentials, decrypted. An unset value is "".
export class IntegrationCredentials {
  private constructor(
    private readonly props: TIntegrationCredentialsProps,
    // The updatedAt of the row these were decrypted from.
    readonly updatedAt: Date
  ) {}

  static restore(props: TIntegrationCredentialsProps, updatedAt: Date): IntegrationCredentials {
    return new IntegrationCredentials(props, updatedAt);
  }

  // Whether these were decrypted from the row version the cached config shows.
  isCurrent(configUpdatedAt: Date): boolean {
    return this.updatedAt.getTime() === configUpdatedAt.getTime();
  }

  toJSON(): TIntegrationCredentialsProps {
    return {
      slack: { ...this.props.slack },
      microsoftTeams: { ...this.props.microsoftTeams },
      gitHubAppConnection: { ...this.props.gitHubAppConnection }
    };
  }
}
