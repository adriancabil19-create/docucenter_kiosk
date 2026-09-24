# DocuCenter Admin — Android APK

A Trusted Web Activity (TWA) built with Google's [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap).
It opens https://docucenterkiosk-production.up.railway.app full-screen in Chrome, so every
admin update ships from Railway with no APK rebuild. Web Push notifications from the admin
reach Android through Chrome's notification delegation.

iOS uses the same site as a PWA: Safari → Share → Add to Home Screen (iOS 16.4+ for push).

## Secrets (not in git, back them up privately)

- `android.keystore`: signing key, alias `android`
- `keystore-password.txt`: store and key password

If you lose these, installed phones can't take updates. They'd have to uninstall and reinstall.

## Railway env var (admin service)

```
ANDROID_SHA256_CERT_FINGERPRINTS=37:23:ED:7E:FD:86:B7:8B:82:6C:D0:AD:F2:F0:A4:DF:E9:07:E6:1F:BD:9D:FA:49:83:A8:EE:DC:AB:3A:4D:78
```

Served at `/.well-known/assetlinks.json`. If the value is missing or wrong, the app shows a URL bar.
If you later publish on Google Play with Play App Signing, add Play's fingerprint too
(comma-separated). You'll find it in Play Console → Setup → App signing.

## Rebuild (only needed for icon, name, color, or version changes)

Toolchain lives in `~/.bubblewrap` (JDK 17 plus Android SDK, build-tools 36.1.0). From Git Bash:

```bash
cd admin-android
unset NoDefaultCurrentDirectoryInExePath
export PATH="$HOME/.bubblewrap/jdk/bin:$PATH"
export BUBBLEWRAP_KEYSTORE_PASSWORD="$(cat keystore-password.txt)" BUBBLEWRAP_KEY_PASSWORD="$(cat keystore-password.txt)"
bubblewrap update            # bumps appVersionCode; required for phones to accept an update
bubblewrap build --skipPwaValidation
```

Output: `app-release-signed.apk` (sideload) and `app-release-bundle.aab` (Play Store).

## Install on a phone

Send `app-release-signed.apk` to the phone, open it, and allow "Install unknown apps" for that source.
Or connect over USB and run `~/.bubblewrap/android_sdk/platform-tools/adb install app-release-signed.apk`.
