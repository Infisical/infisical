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
        "enrollmentType": "acme",
        "caId": "{CERT_CA_ID}",
        "certificateTemplateId": "{CERT_TEMPLATE_ID}",
        "acmeConfig": {}
      }
      """
    Then the value response.status_code should be equal to 200
    And the value response with jq ".certificateProfile.id" should be present
    And the value response with jq ".certificateProfile.slug" should be equal to "{profile_slug}"
    And the value response with jq ".certificateProfile.caId" should be equal to "{CERT_CA_ID}"
    And the value response with jq ".certificateProfile.certificateTemplateId" should be equal to "{CERT_TEMPLATE_ID}"
    And the value response with jq ".certificateProfile.enrollmentType" should be equal to "acme"

  Scenario: Reveal EAB secret
    Given I make a random slug as profile_slug
    And I use AUTH_TOKEN for authentication
    When I send a "POST" request to "/api/v1/cert-manager/certificate-profiles" with JSON payload
      """
      {
        "projectId": "{PROJECT_ID}",
        "slug": "{profile_slug}",
        "description": "",
        "enrollmentType": "acme",
        "caId": "{CERT_CA_ID}",
        "certificateTemplateId": "{CERT_TEMPLATE_ID}",
        "acmeConfig": {}
      }
      """
    Then the value response.status_code should be equal to 200
    And I memorize response with jq ".certificateProfile.id" as profile_id
    When I send a "GET" request to "/api/v1/cert-manager/certificate-profiles/{profile_id}/acme/eab-secret/reveal"
    Then the value response.status_code should be equal to 200
    And the value response with jq ".eabKid" should be equal to "{profile_id}"
    And the value response with jq ".eabSecret" should be present
    And I memorize response with jq ".eabKid" as eab_kid
    And I memorize response with jq ".eabSecret" as eab_secret
    When I have an ACME client connecting to "{BASE_URL}/api/v1/cert-manager/acme/profiles/{profile_id}/directory"
    Then I register a new ACME account with email fangpen@infisical.com and EAB key id "{eab_kid}" with secret "{eab_secret}" as acme_account
