Feature: Nonce

  Scenario: Generate a new nonce
    Given I have an ACME cert profile as "acme_profile"
    When I send a "HEAD" request to "/api/v1/cert-manager/acme/profiles/{acme_profile.id}/new-nonce"
    Then the response status code should be "200"
    And the response header "Replay-Nonce" should contains non-empty value

  Scenario Outline: Send a bad nonce to account endpoints
    Given I have an ACME cert profile as "acme_profile"
    When I have an ACME client connecting to "{BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/directory"
    Then I register a new ACME account with email fangpen@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as acme_account
    And I memorize acme_account.uri with jq "capture("/(?<id>[^/]+)$") | .id" as account_id
    When I create certificate signing request as csr
    Then I add names to certificate signing request csr
      """
      {
        "COMMON_NAME": "localhost"
      }
      """
    Then I create a RSA private key pair as cert_key
    And I sign the certificate signing request csr with private key cert_key and output it as csr_pem in PEM format
    And I submit the certificate signing request PEM csr_pem certificate order to the ACME server as order
    And I memorize <src_var> with jq "<jq>" as <dest_var>
    When I send a raw ACME request to "<url>"
      """
      {
        "protected": {
          "alg": "RS256",
          "nonce": "oFvnlFP1wIhRlYS2jTaXbA",
          "url": "<url>",
          "kid": "{acme_account.uri}"
        },
        "payload": {}
      }
      """
    Then the value response.status_code should be equal to 400
    And the value response with jq ".status" should be equal to 400
    And the value response with jq ".type" should be equal to "urn:ietf:params:acme:error:badNonce"
    And the value response with jq ".detail" should be equal to "Invalid nonce"

    Examples: Endpoints
      | src_var | jq                                        | dest_var      | url                                                                                         |
      | order   | .                                         | not_used      | {BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/accounts/{account_id}/orders |
      | order   | .                                         | not_used      | {BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/new-order                    |
      | order   | .                                         | not_used      | {order.uri}                                                                                 |
      | order   | .                                         | not_used      | {order.uri}/finalize                                                                        |
      | order   | .                                         | not_used      | {order.uri}/certificate                                                                     |
      | order   | .authorizations[0].uri                    | auth_uri      | {auth_uri}                                                                                  |
      | order   | .authorizations[0].body.challenges[0].url | challenge_uri | {challenge_uri}                                                                             |

  Scenario Outline: Send the same nonce twice
    Given I have an ACME cert profile as "acme_profile"
    When I have an ACME client connecting to "{BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/directory"
    Then I register a new ACME account with email fangpen@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as acme_account
    And I memorize acme_account.uri with jq "capture("/(?<id>[^/]+)$") | .id" as account_id
    When I create certificate signing request as csr
    Then I add names to certificate signing request csr
      """
      {
        "COMMON_NAME": "localhost"
      }
      """
    Then I create a RSA private key pair as cert_key
    And I sign the certificate signing request csr with private key cert_key and output it as csr_pem in PEM format
    And I submit the certificate signing request PEM csr_pem certificate order to the ACME server as order
    And I peak and memorize the next nonce as nonce_value
    When I send a raw ACME request to "/api/v1/cert-manager/acme/profiles/{acme_profile.id}/accounts/{account_id}/orders"
      """
      {
        "protected": {
          "alg": "RS256",
          "nonce": "{nonce_value}",
          "url": "{BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/accounts/{account_id}/orders",
          "kid": "{acme_account.uri}"
        },
        "payload": {}
      }
      """
    Then the value response.status_code should be equal to 200
    And I memorize <src_var> with jq "<jq>" as <dest_var>
    When I send a raw ACME request to "<url>"
      """
      {
        "protected": {
          "alg": "RS256",
          "nonce": "{nonce_value}",
          "url": "<url>",
          "kid": "{acme_account.uri}"
        },
        "payload": {}
      }
      """
    Then the value response.status_code should be equal to 400
    And the value response with jq ".status" should be equal to 400
    And the value response with jq ".type" should be equal to "urn:ietf:params:acme:error:badNonce"
    And the value response with jq ".detail" should be equal to "Invalid nonce"

    Examples: Endpoints
      | src_var | jq                                        | dest_var      | url                                                                                         |
      | order   | .                                         | not_used      | {BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/accounts/{account_id}/orders |
      | order   | .                                         | not_used      | {BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/new-order                    |
      | order   | .                                         | not_used      | {order.uri}                                                                                 |
      | order   | .                                         | not_used      | {order.uri}/finalize                                                                        |
      | order   | .                                         | not_used      | {order.uri}/certificate                                                                     |
      | order   | .authorizations[0].uri                    | auth_uri      | {auth_uri}                                                                                  |
      | order   | .authorizations[0].body.challenges[0].url | challenge_uri | {challenge_uri}                                                                             |
