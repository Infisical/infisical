Feature: Access Control

  Scenario Outline: Access resources across different account
    Given I have an ACME cert profile as "acme_profile"
    When I have an ACME client connecting to "{BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/directory"
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
    Then I peak and memorize the next nonce as nonce
    Then I memorize <src_var> with jq "<jq>" as <dest_var>
    When I send a raw ACME request to "<url>"
      """
      {
        "protected": {
          "alg": "RS256",
          "nonce": "{nonce}",
          "url": "<url>",
          "kid": "{acme_account0.uri}"
        },
        "payload": {"invalid": "payload"}
      }
      """
    # With original owner account, the invalid payload is going to trigger other errors instead of 404, this is to make sure
    # that our URLs are actually correct
    Then the value response.status_code should not be equal to 404
    And I put away current ACME client as client0

    When I have an ACME client connecting to "{BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/directory"
    Then I register a new ACME account with email maidu@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as acme_account1
    Then I peak and memorize the next nonce as nonce
    When I send a raw ACME request to "<url>"
      """
      {
        "protected": {
          "alg": "RS256",
          "nonce": "{nonce}",
          "url": "<url>",
          "kid": "{acme_account1.uri}"
        },
        "raw_payload": "<payload>"
      }
      """
    Then the value response.status_code should be equal to 404

    Examples: Endpoints
      | src_var | jq                                        | dest_var      | url                                                                                 | payload         |
      | order   | .                                         | not_used      | {BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/accounts/{account0_id}/orders |                 |
      | order   | .                                         | not_used      | {order.uri}                                                                         |                 |
      | order   | .                                         | not_used      | {order.uri}/finalize                                                                | {\"csr\": \"\"} |
      | order   | .                                         | not_used      | {order.uri}/certificate                                                             |                 |
      | order   | .authorizations[0].uri                    | auth_uri      | {auth_uri}                                                                          |                 |
      | order   | .authorizations[0].body.challenges[0].url | challenge_uri | {challenge_uri}                                                                     | {}              |

  Scenario Outline: Access resources across a different profiles
    Given I have an ACME cert profile as "acme_profile"
    When I have an ACME client connecting to "{BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/directory"
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
    Then I peak and memorize the next nonce as nonce
    Then I memorize <src_var> with jq "<jq>" as <dest_var>
    When I send a raw ACME request to "<url>"
      """
      {
        "protected": {
          "alg": "RS256",
          "nonce": "{nonce}",
          "url": "<url>",
          "kid": "{acme_account0.uri}"
        },
        "payload": {"invalid": "payload"}
      }
      """
    # With original owner account under their profile, the invalid payload is going to trigger other errors instead of
    # 404, this is to make sure that our URLs are actually correct
    Then the value response.status_code should not be equal to 404
    And I put away current ACME client as client0

    Given I make a random slug as profile_slug
    Given I use AUTH_TOKEN for authentication
    When I send a "POST" request to "/api/v1/cert-manager/certificate-profiles" with JSON payload
      """
      {
        "projectId": "{PROJECT_ID}",
        "slug": "{profile_slug}",
        "description": "",
        "enrollmentType": "acme",
        "caId": "{CERT_CA_ID}",
        "certificatePolicyId": "{CERT_POLICY_ID}",
        "acmeConfig": {}
      }
      """
    Then the value response.status_code should be equal to 200
    Then I memorize response with jq ".certificateProfile.id" as profile_id
    When I send a "GET" request to "/api/v1/cert-manager/certificate-profiles/{profile_id}/acme/eab-secret/reveal"
    Then I memorize response with jq ".eabKid" as eab_kid
    And I memorize response with jq ".eabSecret" as eab_secret
    When I have an ACME client connecting to "{BASE_URL}/api/v1/cert-manager/acme/profiles/{profile_id}/directory"
    Then I register a new ACME account with email maidu@infisical.com and EAB key id "{eab_kid}" with secret "{eab_secret}" as acme_account1
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
      | src_var | jq                                        | dest_var      | url                                                                                 | payload         |
      | order   | .                                         | not_used      | {BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/accounts/{account0_id}/orders |                 |
      | order   | .                                         | not_used      | {order.uri}                                                                         |                 |
      | order   | .                                         | not_used      | {order.uri}/finalize                                                                | {\"csr\": \"\"} |
      | order   | .                                         | not_used      | {order.uri}/certificate                                                             |                 |
      | order   | .authorizations[0].uri                    | auth_uri      | {auth_uri}                                                                          |                 |
      | order   | .authorizations[0].body.challenges[0].url | challenge_uri | {challenge_uri}                                                                     | {}              |


  Scenario Outline: Access resources across a different profile with the same key pair
    Given I have an ACME cert profile as "acme_profile"
    When I have an ACME client connecting to "{BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/directory"
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
    Then I peak and memorize the next nonce as nonce
    Then I memorize <src_var> with jq "<jq>" as <dest_var>
    When I send a raw ACME request to "<url>"
      """
      {
        "protected": {
          "alg": "RS256",
          "nonce": "{nonce}",
          "url": "<url>",
          "kid": "{acme_account0.uri}"
        },
        "payload": {"invalid": "payload"}
      }
      """
    # With original owner account under their profile, the invalid payload is going to trigger other errors instead of
    # 404, this is to make sure that our URLs are actually correct
    Then the value response.status_code should not be equal to 404
    And I put away current ACME client as client0

    Given I make a random slug as profile_slug
    Given I use AUTH_TOKEN for authentication
    When I send a "POST" request to "/api/v1/cert-manager/certificate-profiles" with JSON payload
      """
      {
        "projectId": "{PROJECT_ID}",
        "slug": "{profile_slug}",
        "description": "",
        "enrollmentType": "acme",
        "caId": "{CERT_CA_ID}",
        "certificatePolicyId": "{CERT_POLICY_ID}",
        "acmeConfig": {}
      }
      """
    Then the value response.status_code should be equal to 200
    Then I memorize response with jq ".certificateProfile.id" as profile_id
    When I send a "GET" request to "/api/v1/cert-manager/certificate-profiles/{profile_id}/acme/eab-secret/reveal"
    Then I memorize response with jq ".eabKid" as eab_kid
    And I memorize response with jq ".eabSecret" as eab_secret
    When I have an ACME client connecting to "{BASE_URL}/api/v1/cert-manager/acme/profiles/{profile_id}/directory" with the key pair from client0
    Then I register a new ACME account with email maidu@infisical.com and EAB key id "{eab_kid}" with secret "{eab_secret}" as acme_account1
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
        "raw_payload": "<payload>"
      }
      """
    Then the value response.status_code should be equal to 404

    Examples: Endpoints
      | src_var | jq                                        | dest_var      | url                                                                                 | payload         |
      | order   | .                                         | not_used      | {BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/accounts/{account0_id}/orders |                 |
      | order   | .                                         | not_used      | {order.uri}                                                                         |                 |
      | order   | .                                         | not_used      | {order.uri}/finalize                                                                | {\"csr\": \"\"} |
      | order   | .                                         | not_used      | {order.uri}/certificate                                                             |                 |
      | order   | .authorizations[0].uri                    | auth_uri      | {auth_uri}                                                                          |                 |
      | order   | .authorizations[0].body.challenges[0].url | challenge_uri | {challenge_uri}                                                                     | {}              |

  Scenario Outline: URL mismatch
    Given I have an ACME cert profile as "acme_profile"
    When I have an ACME client connecting to "{BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/directory"
    Then I register a new ACME account with email fangpen@infisical.com and EAB key id "{acme_profile.eab_kid}" with secret "{acme_profile.eab_secret}" as acme_account
    Then I memorize acme_account.uri with jq "capture("/(?<id>[^/]+)$") | .id" as account_id
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

    Then I peak and memorize the next nonce as nonce
    Then I memorize <src_var> with jq "<jq>" as <dest_var>
    When I send a raw ACME request to "<actual_url>"
      """
      {
        "protected": {
          "alg": "RS256",
          "nonce": "{nonce}",
          "url": "<bad_url>",
          "kid": "{acme_account.uri}"
        },
        "payload": {}
      }
      """
    Then the value response.status_code should be equal to 400
    Then the value response with jq ".status" should be equal to 400
    Then the value response with jq ".type" should be equal to "urn:ietf:params:acme:error:malformed"
    Then the value response with jq ".detail" should be equal to "<error_detail>"

    Examples: Endpoints
      | src_var | jq                                        | dest_var      | actual_url                                                                         | bad_url                                                                                  | error_detail                         |
      | order   | .                                         | not_used      | {BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/accounts/{account_id}/orders | BAD                                                                                      | Invalid URL in the protected header  |
      | order   | .                                         | not_used      | {BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/accounts/{account_id}/orders | https://evil.com/api/v1/cert-manager/acme/profiles/{acme_profile.id}/accounts/{account_id}/orders | URL mismatch in the protected header |
      | order   | .                                         | not_used      | {order.uri}                                                                        | BAD                                                                                      | Invalid URL in the protected header  |
      | order   | .                                         | not_used      | {order.uri}                                                                        | https://example.com/acmes/orders/FOOBAR                                                  | URL mismatch in the protected header |
      | order   | .                                         | not_used      | {order.uri}/finalize                                                               | BAD                                                                                      | Invalid URL in the protected header  |
      | order   | .                                         | not_used      | {order.uri}/finalize                                                               | https://example.com/acmes/orders/FOOBAR/finalize                                         | URL mismatch in the protected header |
      | order   | .                                         | not_used      | {order.uri}/certificate                                                            | BAD                                                                                      | Invalid URL in the protected header  |
      | order   | .                                         | not_used      | {order.uri}/certificate                                                            | https://example.com/acmes/orders/FOOBAR/certificate                                      | URL mismatch in the protected header |
      | order   | .authorizations[0].uri                    | auth_uri      | {auth_uri}                                                                         | BAD                                                                                      | Invalid URL in the protected header  |
      | order   | .authorizations[0].uri                    | auth_uri      | {auth_uri}                                                                         | https://example.com/acmes/auths/FOOBAR                                                   | URL mismatch in the protected header |
      | order   | .authorizations[0].body.challenges[0].url | challenge_uri | {challenge_uri}                                                                    | BAD                                                                                      | Invalid URL in the protected header  |
      | order   | .authorizations[0].body.challenges[0].url | challenge_uri | {challenge_uri}                                                                    | https://example.com/acmes/challenges/FOOBAR                                              | URL mismatch in the protected header |

  Scenario Outline: Send KID and JWK in the same time
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
    And I memorize <src_var> with jq "<jq>" as <dest_var>
    When I send a raw ACME request to "<url>"
      """
      {
        "protected": {
          "alg": "RS256",
          "nonce": "{nonce_value}",
          "url": "<url>",
          "kid": "{acme_account.uri}",
          "jwk": {
            "n": "mmEWxUv2lUYDZe_M2FXJ_WDXgHoEG7PVvg-dfz1STzyMwx0qvM66KMenXSyVA0r-_Ssb6p8VexSWGOFKskM4ryKUihn2KNH5e8nXZBqzqYeKQ8vqaCdaWzTxFI1dg0xhk0CWptkZHxpRpLalztFJ1Pq7L2qvQOM2YT7wPYbwQhpaSiVNXAb1W4FwAPyC04v1mHehvST-esaDT7j_5-eU5cCcmyi4_g5nBawcinOjj5o3VCg4X8UjK--AjhAyYHx1nRMr-7xk4x-0VIpQ_OODjLB3WzN8s1YEb0Jx5Bv1JyeCw35zahqs3fAFyRje-p5ENk9NCxfz5x9ZGkszkkNt0Q",
            "e": "AQAB",
            "kty": "RSA"
          }
        },
        "payload": {}
      }
      """
    Then the value response.status_code should be equal to 400
    And the value response with jq ".status" should be equal to 400
    And the value response with jq ".type" should be equal to "urn:ietf:params:acme:error:malformed"
    And the value response with jq ".detail" should be equal to "Both JWK and KID are provided in the protected header"

    Examples: Endpoints
      | src_var | jq                                        | dest_var      | url                                                                                |
      | order   | .                                         | not_used      | {BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/accounts/{account_id}/orders |
      | order   | .                                         | not_used      | {BASE_URL}/api/v1/cert-manager/acme/profiles/{acme_profile.id}/new-order                    |
      | order   | .                                         | not_used      | {order.uri}                                                                        |
      | order   | .                                         | not_used      | {order.uri}/finalize                                                               |
      | order   | .                                         | not_used      | {order.uri}/certificate                                                            |
      | order   | .authorizations[0].uri                    | auth_uri      | {auth_uri}                                                                         |
      | order   | .authorizations[0].body.challenges[0].url | challenge_uri | {challenge_uri}                                                                    |
