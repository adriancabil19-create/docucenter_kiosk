import { getStorageSettings, getStorageDocuments } from '@/lib/backend';
import type { StorageSettings, StorageDocMeta } from '@/lib/types';
import { StorageSettingsForm } from '@/components/storage-settings-form';
import { StorageMetaTable } from '@/components/storage-meta-table';

export const dynamic = 'force-dynamic';

export default async function StoragePage() {
  let settings: StorageSettings | null = null;
  let documents: StorageDocMeta[] = [];
  try {
    settings = (await getStorageSettings()).settings;
  } catch {
    // Backend unavailable at SSR time.
  }
  try {
    documents = (await getStorageDocuments(500)).documents;
  } catch {
    // No metadata yet.
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Storage</h1>
        <p className="mt-1 text-sm text-slate-500">
          Retention policy and a metadata-only view of documents on the kiosks. File contents never
          leave the kiosk — the cloud only tracks name, size, and age. Retention is enforced on the
          kiosk regardless of what the app itself does.
        </p>
      </div>

      <StorageSettingsForm initial={settings} />

      <div className="glass p-5">
        <StorageMetaTable initial={documents} />
      </div>
    </div>
  );
}
