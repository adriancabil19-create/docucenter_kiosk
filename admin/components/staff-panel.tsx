'use client';

import { useMemo, useRef, useState } from 'react';
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
  Chip,
  Select,
  SelectItem,
  addToast,
} from '@heroui/react';
import type { StaffMember, StaffRole, PinResetRequest } from '@/lib/types';
import {
  getStaff,
  createStaff,
  updateStaff,
  disableStaff,
  reactivateStaff,
  resetStaffPin,
  getPendingPinResetRequests,
  approvePinResetRequest,
  denyPinResetRequest,
} from '@/lib/api';
import { usePoll } from '@/lib/use-poll';
import { glassTableClassNames } from '@/components/table-styles';

const glassModalClassNames = { base: 'glass-strong', backdrop: 'bg-slate-900/20 backdrop-blur-sm' };
const inputClass =
  'glass-inset w-full px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/50';

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'short', timeStyle: 'short' }) : '—';

/** Two-step inline confirm, same idiom as the fleet panel's CmdButton — avoids window.confirm(). */
function ConfirmButton({
  label,
  confirmLabel,
  color = 'default',
  busy,
  onConfirm,
}: {
  label: string;
  confirmLabel: string;
  color?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
  busy: boolean;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handle = () => {
    if (armed) {
      if (timer.current) clearTimeout(timer.current);
      setArmed(false);
      onConfirm();
    } else {
      setArmed(true);
      timer.current = setTimeout(() => setArmed(false), 4000);
    }
  };

  return (
    <Button size="sm" variant="flat" color={armed ? 'danger' : color} isLoading={busy} onPress={handle}>
      {armed ? confirmLabel : label}
    </Button>
  );
}

function RoleChip({ role }: { role: StaffRole }) {
  return (
    <Chip size="sm" variant="flat" color={role === 'admin' ? 'primary' : 'default'} className="capitalize">
      {role}
    </Chip>
  );
}

function StaffStatusChip({ status }: { status: StaffMember['status'] }) {
  return (
    <Chip size="sm" variant="flat" color={status === 'active' ? 'success' : 'danger'} className="capitalize">
      {status}
    </Chip>
  );
}

const emptyCreateForm = { name: '', username: '', pin: '', confirmPin: '', role: 'staff' as StaffRole };

export function StaffPanel({ currentAdmin }: { currentAdmin: string }) {
  const staffFetcher = useMemo(() => () => getStaff().then((r) => r.staff), []);
  const { data: staffData, loading: staffLoading, refresh: refreshStaff } = usePoll<StaffMember[]>(
    staffFetcher,
    15000,
    [],
  );
  const staff = staffData ?? [];

  const requestsFetcher = useMemo(() => () => getPendingPinResetRequests().then((r) => r.requests), []);
  const { data: requestsData, refresh: refreshRequests } = usePoll<PinResetRequest[]>(
    requestsFetcher,
    8000,
    [],
  );
  const requests = requestsData ?? [];

  const [busyId, setBusyId] = useState<string | null>(null);

  // Create
  const createModal = useDisclosure();
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [creating, setCreating] = useState(false);

  const submitCreate = async () => {
    const { name, username, pin, confirmPin, role } = createForm;
    if (!name.trim() || !username.trim()) {
      addToast({ title: 'Missing fields', description: 'Name and username are required.', color: 'warning' });
      return;
    }
    if (!/^\d{6}$/.test(pin)) {
      addToast({ title: 'Invalid PIN', description: 'PIN must be exactly 6 digits.', color: 'warning' });
      return;
    }
    if (pin !== confirmPin) {
      addToast({ title: 'PIN mismatch', description: 'PIN and confirmation do not match.', color: 'warning' });
      return;
    }
    setCreating(true);
    try {
      const res = await createStaff({ name, username, pin, confirmPin, role, actor: currentAdmin });
      if (!res.success || !res.staff) throw new Error(res.error ?? 'Failed to create staff account');
      addToast({
        title: 'Staff account created',
        description: `${res.staff.id} · ${res.staff.username}`,
        color: 'success',
      });
      setCreateForm(emptyCreateForm);
      createModal.onClose();
      refreshStaff();
    } catch (err) {
      addToast({ title: 'Create failed', description: (err as Error).message, color: 'danger' });
    } finally {
      setCreating(false);
    }
  };

  // Edit
  const editModal = useDisclosure();
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [editForm, setEditForm] = useState({ name: '', username: '', role: 'staff' as StaffRole });
  const [savingEdit, setSavingEdit] = useState(false);

  const openEdit = (s: StaffMember) => {
    setEditing(s);
    setEditForm({ name: s.name, username: s.username, role: s.role });
    editModal.onOpen();
  };

  const submitEdit = async () => {
    if (!editing) return;
    setSavingEdit(true);
    try {
      const res = await updateStaff(editing.id, { ...editForm, actor: currentAdmin });
      if (!res.success) throw new Error(res.error ?? 'Failed to update staff account');
      addToast({ title: 'Staff updated', color: 'success' });
      editModal.onClose();
      refreshStaff();
    } catch (err) {
      addToast({ title: 'Update failed', description: (err as Error).message, color: 'danger' });
    } finally {
      setSavingEdit(false);
    }
  };

  // Reset PIN
  const resetModal = useDisclosure();
  const [resetTarget, setResetTarget] = useState<StaffMember | null>(null);
  const [resetForm, setResetForm] = useState({ newPin: '', confirmPin: '' });
  const [resetting, setResetting] = useState(false);

  const openReset = (s: StaffMember) => {
    setResetTarget(s);
    setResetForm({ newPin: '', confirmPin: '' });
    resetModal.onOpen();
  };

  const submitReset = async () => {
    if (!resetTarget) return;
    if (!/^\d{6}$/.test(resetForm.newPin) || resetForm.newPin !== resetForm.confirmPin) {
      addToast({
        title: 'Invalid PIN',
        description: 'Enter a matching 6-digit PIN in both fields.',
        color: 'warning',
      });
      return;
    }
    setResetting(true);
    try {
      const res = await resetStaffPin(resetTarget.id, resetForm.newPin, resetForm.confirmPin, currentAdmin);
      if (!res.success) throw new Error(res.error ?? 'Failed to reset PIN');
      addToast({ title: 'PIN reset', description: `${resetTarget.username}'s PIN has been changed.`, color: 'success' });
      resetModal.onClose();
    } catch (err) {
      addToast({ title: 'Reset failed', description: (err as Error).message, color: 'danger' });
    } finally {
      setResetting(false);
    }
  };

  // Disable / Reactivate
  const toggleStatus = async (s: StaffMember) => {
    setBusyId(s.id);
    try {
      const res = s.status === 'active' ? await disableStaff(s.id, currentAdmin) : await reactivateStaff(s.id, currentAdmin);
      if (!res.success) throw new Error(res.error ?? 'Action failed');
      addToast({
        title: s.status === 'active' ? 'Staff disabled' : 'Staff reactivated',
        description: s.username,
        color: 'success',
      });
      refreshStaff();
    } catch (err) {
      addToast({ title: 'Action failed', description: (err as Error).message, color: 'danger' });
    } finally {
      setBusyId(null);
    }
  };

  // PIN-recovery requests
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const decide = async (req: PinResetRequest, decision: 'approve' | 'deny') => {
    setDecidingId(req.id);
    try {
      const res =
        decision === 'approve'
          ? await approvePinResetRequest(req.id, currentAdmin)
          : await denyPinResetRequest(req.id, currentAdmin);
      if (!res.success) throw new Error(res.error ?? 'Failed to decide request');
      addToast({
        title: decision === 'approve' ? 'Request approved' : 'Request denied',
        description: `${req.username} will see this on their kiosk within a few seconds.`,
        color: 'success',
      });
      refreshRequests();
    } catch (err) {
      addToast({ title: 'Action failed', description: (err as Error).message, color: 'danger' });
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <div className="space-y-8">
      {requests.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-slate-700">
            Pending PIN Recovery Requests ({requests.length})
          </h2>
          <div className="space-y-2">
            {requests.map((req) => (
              <div
                key={req.id}
                className="glass-inset flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-slate-800">{req.username}</p>
                  <p className="text-xs text-slate-500">
                    Requested {fmt(req.requested_at)} from kiosk {req.kiosk_id}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    color="success"
                    variant="flat"
                    isLoading={decidingId === req.id}
                    onPress={() => decide(req, 'approve')}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    color="danger"
                    variant="flat"
                    isLoading={decidingId === req.id}
                    onPress={() => decide(req, 'deny')}
                  >
                    Deny
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">Staff Accounts</h2>
          <Button size="sm" color="primary" onPress={() => { setCreateForm(emptyCreateForm); createModal.onOpen(); }}>
            + Create Staff
          </Button>
        </div>

        <Table aria-label="Staff accounts" isStriped classNames={glassTableClassNames}>
          <TableHeader>
            <TableColumn>Name</TableColumn>
            <TableColumn>Username</TableColumn>
            <TableColumn>Role</TableColumn>
            <TableColumn>Status</TableColumn>
            <TableColumn>Last Login</TableColumn>
            <TableColumn>Actions</TableColumn>
          </TableHeader>
          <TableBody emptyContent={staffLoading ? 'Loading…' : 'No staff accounts yet.'}>
            {staff.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium text-slate-800">{s.name}</TableCell>
                <TableCell className="font-mono text-xs">{s.username}</TableCell>
                <TableCell><RoleChip role={s.role} /></TableCell>
                <TableCell><StaffStatusChip status={s.status} /></TableCell>
                <TableCell className="text-xs text-slate-400">{fmt(s.last_login_at)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="flat" onPress={() => openEdit(s)}>Edit</Button>
                    <Button size="sm" variant="flat" onPress={() => openReset(s)}>Reset PIN</Button>
                    <ConfirmButton
                      label={s.status === 'active' ? 'Disable' : 'Reactivate'}
                      confirmLabel="Confirm?"
                      color={s.status === 'active' ? 'danger' : 'success'}
                      busy={busyId === s.id}
                      onConfirm={() => toggleStatus(s)}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Create */}
      <Modal isOpen={createModal.isOpen} onOpenChange={createModal.onOpenChange} classNames={glassModalClassNames}>
        <ModalContent>
          <ModalHeader>Create Staff Member</ModalHeader>
          <ModalBody className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Full Name</label>
              <input className={inputClass} value={createForm.name}
                onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Username</label>
              <input className={inputClass} value={createForm.username}
                onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Create Staff PIN</label>
                <input className={inputClass} type="password" inputMode="numeric" maxLength={6} value={createForm.pin}
                  onChange={(e) => setCreateForm((f) => ({ ...f, pin: e.target.value.replace(/\D/g, '') }))} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Confirm Staff PIN</label>
                <input className={inputClass} type="password" inputMode="numeric" maxLength={6} value={createForm.confirmPin}
                  onChange={(e) => setCreateForm((f) => ({ ...f, confirmPin: e.target.value.replace(/\D/g, '') }))} />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Role</label>
              <Select
                selectedKeys={[createForm.role]}
                onSelectionChange={(keys) =>
                  setCreateForm((f) => ({ ...f, role: (Array.from(keys)[0] as StaffRole) ?? 'staff' }))
                }
                aria-label="Role"
              >
                <SelectItem key="staff">Staff</SelectItem>
                <SelectItem key="admin">Admin</SelectItem>
              </Select>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={createModal.onClose}>Cancel</Button>
            <Button color="primary" isLoading={creating} onPress={submitCreate}>Create Staff</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Edit */}
      <Modal isOpen={editModal.isOpen} onOpenChange={editModal.onOpenChange} classNames={glassModalClassNames}>
        <ModalContent>
          <ModalHeader>Edit Staff</ModalHeader>
          <ModalBody className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Name</label>
              <input className={inputClass} value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Username</label>
              <input className={inputClass} value={editForm.username}
                onChange={(e) => setEditForm((f) => ({ ...f, username: e.target.value }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Role</label>
              <Select
                selectedKeys={[editForm.role]}
                onSelectionChange={(keys) =>
                  setEditForm((f) => ({ ...f, role: (Array.from(keys)[0] as StaffRole) ?? 'staff' }))
                }
                aria-label="Role"
              >
                <SelectItem key="staff">Staff</SelectItem>
                <SelectItem key="admin">Admin</SelectItem>
              </Select>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={editModal.onClose}>Cancel</Button>
            <Button color="primary" isLoading={savingEdit} onPress={submitEdit}>Save Changes</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* Reset PIN */}
      <Modal isOpen={resetModal.isOpen} onOpenChange={resetModal.onOpenChange} classNames={glassModalClassNames}>
        <ModalContent>
          <ModalHeader>Reset Staff PIN</ModalHeader>
          <ModalBody className="space-y-3">
            <p className="text-sm text-slate-700">Staff: <span className="font-semibold">{resetTarget?.name}</span></p>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">New PIN</label>
              <input className={inputClass} type="password" inputMode="numeric" maxLength={6} value={resetForm.newPin}
                onChange={(e) => setResetForm((f) => ({ ...f, newPin: e.target.value.replace(/\D/g, '') }))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Confirm New PIN</label>
              <input className={inputClass} type="password" inputMode="numeric" maxLength={6} value={resetForm.confirmPin}
                onChange={(e) => setResetForm((f) => ({ ...f, confirmPin: e.target.value.replace(/\D/g, '') }))} />
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={resetModal.onClose}>Cancel</Button>
            <Button color="primary" isLoading={resetting} onPress={submitReset}>Reset PIN</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
