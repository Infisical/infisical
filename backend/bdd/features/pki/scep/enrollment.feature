Feature: Enrollment

  Scenario: Successful enrollment with valid challenge password
    Given I have a SCEP cert profile with challenge password "testpassword123" as "scep_profile"
    When I enroll via SCEP for CN "test-device.example.com" with challenge "testpassword123" on profile "scep_profile"
    Then the SCEP enrollment should succeed
    And the issued SCEP certificate subject CN should be "test-device.example.com"
    And the issued SCEP certificate should be signed by the CA

  Scenario: Enrollment with different common names
    Given I have a SCEP cert profile with challenge password "mySecurePass99" as "scep_profile"
    When I enroll via SCEP for CN "router-01.corp.local" with challenge "mySecurePass99" on profile "scep_profile"
    Then the SCEP enrollment should succeed
    And the issued SCEP certificate subject CN should be "router-01.corp.local"

  Scenario: Multiple enrollments on the same profile
    Given I have a SCEP cert profile with challenge password "testpassword123" as "scep_profile"
    When I enroll via SCEP for CN "device-01.example.com" with challenge "testpassword123" on profile "scep_profile"
    Then the SCEP enrollment should succeed
    And the issued SCEP certificate subject CN should be "device-01.example.com"
    When I enroll via SCEP for CN "device-02.example.com" with challenge "testpassword123" on profile "scep_profile"
    Then the SCEP enrollment should succeed
    And the issued SCEP certificate subject CN should be "device-02.example.com"
