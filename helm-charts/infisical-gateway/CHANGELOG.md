## 1.0.4 (December 9, 2025)
* Updated default CLI image version from `0.43.0` to `0.43.39`.
* Added new `gateway.pamSessionRecordingsDirectory`, allowing users to specify the folder where temporary session recording files for PAM are stored. Defaults to `/var/lib/infisical/session_recordings`
* Added volume mounts for the user-specified `pamSessionRecordingsDirectory` path, and `/var/lib/infisical` for cached relay data.

## 1.0.3 (November 14, 2025)
* Added support for setting the image repository by setting `image.repository`. Defaults to `infisical/cli`.

## 0.0.41 (June 10, 2025)
* Added new gateway action for fully off-loading CA certificate, cluster URL, and token management to the gateway.
* Structural improvements

## 0.0.4 (June 7th, 2025)
* Improvements to HTTP proxy error handling.

## 0.0.3 (June 6, 2025)

* Minor fix for handling malformed URLs for HTTP forwarding.

## 0.0.2 (June 6, 2025)

* Bumped default CLI image version from 0.41.1 -> 0.41.8.
   * This new image version supports using the gateway as a token reviewer for the Identity Kubernetes Auth method. 

## 0.0.1 (May 1, 2025)

* Initial helm release.