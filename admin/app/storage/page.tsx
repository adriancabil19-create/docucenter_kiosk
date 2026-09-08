import { getStorageSettings, getDocuments } from '@/lib/backend';
import type { StorageSettings, StorageDocument } from '@/lib/types';
import { StorageSettingsForm } from '@/components/storage-settings-form';
import { StorageTable } from '@/components/storage-table';

export const dynamic = 'force-dynamic';

export default async function StoragePage() {
  let settings: StorageSettings | null = null;
  let documents: StorageDocument[] = [];
  try {
    settings = (await getStorageSettings()).settings;
  } catch {
    // Backend unavailable at SSR time.
  }
  try {
    documents = (await getDocuments()).documents;
  } catch {
    // Storage backend (kiosk-local) may be unreachable from the cloud.
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Storage</h1>
        <p className="mt-1 text-sm text-slate-500">
          Retention policy and stored documents. Retention is enforced on the kiosk regardless of
          what the app itself does.
        </p>
      </div>

      <StorageSettingsForm initial={settings} />

      <div className="glass p-5">
        <StorageTable initialData={documents} />
      </div>
    </div>
  );
}
