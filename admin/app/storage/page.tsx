import { Suspense } from 'react';
import { getStorageSettings, getStorageDocuments } from '@/lib/backend';
import type { StorageSettings, StorageDocMeta } from '@/lib/types';
import { StorageSettingsForm } from '@/components/storage-settings-form';
import { StorageMetaTable } from '@/components/storage-meta-table';
import { SectionSkeleton } from '@/components/section-skeleton';

export const dynamic = 'force-dynamic';

// Two independent boundaries, not one sequential try/catch pair — settings
// and documents used to be awaited back to back, so the (usually larger)
// documents fetch delayed the settings form for no reason. Splitting them
// lets both requests fire in parallel.

async function StorageSettingsContent() {
  let settings: StorageSettings | null = null;
  try {
    settings = (await getStorageSettings()).settings;
  } catch {
    // Backend unavailable at SSR time.
  }
  return <StorageSettingsForm initial={settings} />;
}

async function StorageDocumentsContent() {
  let documents: StorageDocMeta[] = [];
  try {
    documents = (await getStorageDocuments(500)).documents;
  } catch {
    // No metadata yet.
  }
  return (
    <div className="glass p-5">
      <StorageMetaTable initial={documents} />
    </div>
  );
}

export default function StoragePage() {
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

      <Suspense fallback={<SectionSkeleton />}>
        <StorageSettingsContent />
      </Suspense>

      <Suspense fallback={<SectionSkeleton />}>
        <StorageDocumentsContent />
      </Suspense>
    </div>
  );
}
