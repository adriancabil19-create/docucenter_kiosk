// Digital Asset Links: proves the Android TWA app (android-twa/) owns this
// origin. Without a match Chrome shows a URL bar inside the app.
// ANDROID_SHA256_CERT_FINGERPRINTS is comma-separated so a Play App Signing
// fingerprint can sit alongside the local upload key's.
export const dynamic = 'force-dynamic';

const DEFAULT_PACKAGE_NAME = 'com.docucenter.admin';

export function GET() {
  const packageName = process.env.ANDROID_PACKAGE_NAME || DEFAULT_PACKAGE_NAME;
  const fingerprints = (process.env.ANDROID_SHA256_CERT_FINGERPRINTS ?? '')
    .split(',')
    .map((f) => f.trim().toUpperCase())
    .filter(Boolean);

  const body = fingerprints.length
    ? [
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: { namespace: 'android_app', package_name: packageName, sha256_cert_fingerprints: fingerprints },
        },
      ]
    : [];

  return Response.json(body, { headers: { 'cache-control': 'public, max-age=300' } });
}
