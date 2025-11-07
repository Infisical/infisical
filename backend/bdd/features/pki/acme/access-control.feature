Feature: Access Control

  Scenario Outline: Access across resources for a different account
    Given I have an ACME cert profile as "acme_profile"
    When I have an ACME client connecting to {BASE_URL}/api/v1/pki/acme/profiles/{acme_profile.id}/directory
    Then I register a new ACME account with email fangpen@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as acme_account0
    Then I memorize acme_account0.uri with jq "capture("/(?<id>[^/]+)$") | .id" as account0_id
    When I create certificate signing request as csr
    Then I add names to certificate signing request csr
      """
      {
        "COMMON_NAME": "localhost"
      }
      """
    Then I create a RSA private key pair as cert_key
    Then I sign the certificate signing request csr with private key cert_key and output it as csr_pem in PEM format
    Then I submit the certificate signing request PEM csr_pem certificate order to the ACME server as order
    And I put away current ACME client as client0

    When I have an ACME client connecting to {BASE_URL}/api/v1/pki/acme/profiles/{acme_profile.id}/directory
    Then I register a new ACME account with email maidu@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as acme_account1
    Then I peak and memorize the next nonce as nonce
    Then I memorize <src_var> with jq "<jq>" as <dest_var>
    When I send a raw ACME request to "<url>"
    """
    {
      "protected": {
        "alg": "RS256",
        "nonce": "{nonce}",
        "url": "<url>",
        "kid": "{acme_account1.uri}"
      },
      "payload": {}
    }
    """
    Then the value response.status_code should be equal to 404

    Examples: Endpoints
      | src_var | jq                                        | dest_var      | url
      | order   | .                                         | not_used      | {BASE_URL}/api/v1/pki/acme/profiles/{acme_profile.id}/accounts/{account0_id}/orders |
      | order   | .                                         | not_used      | {order.uri}                                                                         |
      | order   | .                                         | not_used      | {order.uri}/finalize                                                                |
      | order   | .                                         | not_used      | {order.uri}/certificate                                                             |
      | order   | .authorizations[0].uri                    | auth_uri      | {auth_uri}                                                                          |
      | order   | .authorizations[0].body.challenges[0].url | challenge_uri | {challenge_uri}                                                                     |
