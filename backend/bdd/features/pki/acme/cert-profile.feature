Feature: ACME Cert Profile

  Scenario: Create a cert profile
    Given I make a random slug as profile_slug
    And I use AUTH_TOKEN for authentication
    When I send a "POST" request to "/api/v1/cert-manager/certificate-profiles" with JSON payload
      """
      {
        "projectId": "{PROJECT_ID}",
        "slug": "{profile_slug}",
        "description": "",
        "caId": "{CERT_CA_ID}",
        "certificatePolicyId": "{CERT_POLICY_ID}"
      }
      """
    Then the value response.status_code should be equal to 200
    And the value response with jq ".certificateProfile.id" should be present
    And the value response with jq ".certificateProfile.slug" should be equal to "{profile_slug}"
    And the value response with jq ".certificateProfile.caId" should be equal to "{CERT_CA_ID}"
    And the value response with jq ".certificateProfile.certificatePolicyId" should be equal to "{CERT_POLICY_ID}"

  Scenario: Enable ACME enrollment on an application and reveal the EAB secret
    Given I have an ACME cert profile as "acme_profile"
    When I have an ACME client connecting to "{BASE_URL}/api/v1/cert-manager/acme/applications/{acme_profile.app_id}/profiles/{acme_profile.id}/directory"
    Then I register a new ACME account with email fangpen@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as acme_account
