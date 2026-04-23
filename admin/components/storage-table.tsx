'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Table,
  TableHeader,
  TableColumn,
  TableBody,
  TableRow,
  TableCell,
  Button,
  Modal,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  useDisclosure,
  addToast,
} from '@heroui/react';
import { getDocuments, deleteDocument } from '@/lib/api';
import type { StorageDocument } from '@/lib/types';

interface Props {
  initialData: StorageDocument[];
}

export function StorageTable({ initialData }: Props) {
  const [rows, setRows] = useState<StorageDocument[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StorageDocument | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await getDocuments();
      setRows(res.documents);
      if (!silent) {
        addToast({
          title: 'Refreshed',
          description: `${res.count} file(s) in storage.`,
          color: 'success',
        });
      }
    } catch (err) {
      if (!silent) {
        addToast({
          title: 'Refresh failed',
          description: err instanceof Error ? err.message : 'Could not reach the server.',
          color: 'danger',
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Auto-refresh every 30 seconds so newly uploaded files appear without manual action
  useEffect(() => {
    const id = setInterval(() => refresh(true), 30_000);
    return () => clearInterval(id);
  }, [refresh]);

  const confirmDelete = useCallback(
    (doc: StorageDocument) => {
      setPendingDelete(doc);
      onOpen();
    },
    [onOpen],
  );

  const handleDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setDeleting(pendingDelete.id);
    onClose();
    try {
      await deleteDocument(pendingDelete.name);
      setRows((prev) => prev.filter((d) => d.id !== pendingDelete.id));
      addToast({
        title: 'Deleted',
        description: `"${pendingDelete.originalName}" removed from storage.`,
        color: 'success',
      });
    } catch (err) {
      addToast({
        title: 'Delete failed',
        description: err instanceof Error ? err.message : 'Could not delete file.',
        color: 'danger',
      });
    } finally {
      setDeleting(null);
      setPendingDelete(null);
    }
  }, [pendingDelete, onClose]);

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">{rows.length} file(s)</p>
          <Button size="sm" variant="flat" color="primary" isLoading={loading} onPress={() => refresh()}>
            Refresh
          </Button>
        </div>

        <Table aria-label="Storage table" removeWrapper>
          <TableHeader>
            <TableColumn>Filename</TableColumn>
            <TableColumn>Format</TableColumn>
            <TableColumn>Pages</TableColumn>
            <TableColumn>Size</TableColumn>
            <TableColumn>Date</TableColumn>
            <TableColumn>Actions</TableColumn>
          </TableHeader>
          <TableBody emptyContent="No files in storage.">
            {rows.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell>
                  <div>
                    <p className="text-sm font-medium">{doc.originalName}</p>
                    <p className="font-mono text-xs text-gray-400">{doc.id}</p>
                  </div>
                </TableCell>
                <TableCell className="text-xs uppercase text-gray-600">{doc.format}</TableCell>
                <TableCell className="text-center text-xs">{doc.pages}</TableCell>
                <TableCell className="text-xs">{doc.size}</TableCell>
                <TableCell className="text-xs">{doc.date}</TableCell>
                <TableCell>
                  <Button
                    size="sm"
                    color="danger"
                    variant="flat"
                    isLoading={deleting === doc.id}
                    onPress={() => confirmDelete(doc)}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Delete confirmation modal */}
      <Modal isOpen={isOpen} onClose={onClose} size="sm">
        <ModalContent>
          <ModalHeader>Delete File</ModalHeader>
          <ModalBody>
            <p className="text-sm text-gray-600">
              Are you sure you want to permanently delete{' '}
              <span className="font-semibold text-gray-900">
                &quot;{pendingDelete?.originalName}&quot;
              </span>
              ? This action cannot be undone.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={onClose}>
              Cancel
            </Button>
            <Button color="danger" onPress={handleDelete}>
              Delete
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
