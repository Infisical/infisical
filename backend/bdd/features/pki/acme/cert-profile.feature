Feature: ACME Cert Profile

  Scenario: Create a cert profile
    Given I make a random slug as profile_slug
    Given I use AUTH_TOKEN for authentication
    When I send a POST request to "/api/v1/pki/certificate-profiles" with JSON payload
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
    Then the value response with jq .certificateProfile.slug should be equal to "{profile_slug}"
    Then the value response with jq .certificateProfile.caId should be equal to "{CERT_CA_ID}"
    Then the value response with jq .certificateProfile.certificateTemplateId should be equal to "{CERT_TEMPLATE_ID}"
    Then the value response with jq .certificateProfile.enrollmentType should be equal to "acme"
    Then the value response with jq .certificateProfile.eab_kid should be present
    Then the value response with jq .certificateProfile.eab_secret should be present
