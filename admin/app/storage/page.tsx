import { getDocuments } from '@/lib/api';
import type { StorageDocument } from '@/lib/types';
import { StorageTable } from '@/components/storage-table';

export const dynamic = 'force-dynamic';

export default async function StoragePage() {
  let documents: StorageDocument[] = [];
  try {
    const res = await getDocuments();
    documents = res.documents;
  } catch {
    // Server unavailable at build/SSR time — the client can still refresh
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Storage</h1>
        <p className="mt-1 text-sm text-gray-500">
          Files currently stored on the kiosk backend. Delete removes the file permanently.
        </p>
      </div>

      <div className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <StorageTable initialData={documents} />
      </div>
    </div>
  );
}
