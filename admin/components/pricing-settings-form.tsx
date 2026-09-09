'use client';

import { useMemo, useState } from 'react';
import { Button, Input, addToast } from '@heroui/react';
import type { PricingSettings } from '@/lib/types';
import { updatePricingSettings } from '@/lib/api';

/** Rows rendered in the form — each maps to one price field. */
const ROWS: {
  group: 'print' | 'photocopy';
  tier: 'draft' | 'standard' | 'high';
  label: string;
}[] = [
  { group: 'print', tier: 'draft', label: 'Print · Draft' },
  { group: 'print', tier: 'standard', label: 'Print · Standard' },
  { group: 'photocopy', tier: 'draft', label: 'Photocopy · Draft' },
  { group: 'photocopy', tier: 'standard', label: 'Photocopy · Standard' },
  { group: 'photocopy', tier: 'high', label: 'Photocopy · High' },
];

type Draft = Record<string, string>; // key: `${group}.${tier}.${bw|color}`

function toDraft(p: PricingSettings): Draft {
  const d: Draft = {};
  for (const { group, tier } of ROWS) {
    const t = (p as unknown as Record<string, Record<string, { bw: number; color: number }>>)[group][
      tier
    ];
    d[`${group}.${tier}.bw`] = String(t.bw);
    d[`${group}.${tier}.color`] = String(t.color);
  }
  return d;
}

export function PricingSettingsForm({ initial }: { initial: PricingSettings | null }) {
  const base = useMemo<Draft>(() => (initial ? toDraft(initial) : {}), [initial]);
  const [draft, setDraft] = useState<Draft>(base);
  const [saving, setSaving] = useState(false);
  const updatedAt = initial?.updated_at ?? '';

  if (!initial) {
    return (
      <div className="glass p-5 text-sm text-red-700">
        Could not load current pricing from the backend.
      </div>
    );
  }

  const set = (key: string, value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const num = (key: string): number => {
    const n = Number(draft[key]);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
  };

  const dirty = Object.keys(base).some((k) => (draft[k] ?? '') !== (base[k] ?? ''));

  const save = async () => {
    // Validate every field first.
    for (const { group, tier, label } of ROWS) {
      for (const mode of ['bw', 'color'] as const) {
        if (Number.isNaN(num(`${group}.${tier}.${mode}`))) {
          addToast({
            title: 'Invalid price',
            description: `${label} — ${mode === 'bw' ? 'B&W' : 'Colour'} must be 0 or more.`,
            color: 'danger',
          });
          return;
        }
      }
    }

    const patch = {
      print: {
        draft: { bw: num('print.draft.bw'), color: num('print.draft.color') },
        standard: { bw: num('print.standard.bw'), color: num('print.standard.color') },
      },
      photocopy: {
        draft: { bw: num('photocopy.draft.bw'), color: num('photocopy.draft.color') },
        standard: { bw: num('photocopy.standard.bw'), color: num('photocopy.standard.color') },
        high: { bw: num('photocopy.high.bw'), color: num('photocopy.high.color') },
      },
    };

    setSaving(true);
    try {
      const res = await updatePricingSettings(patch);
      setDraft(toDraft(res.settings));
      addToast({
        title: 'Prices saved',
        description: 'Kiosks pick up the new prices on their next poll (~2s).',
        color: 'success',
      });
    } catch (err) {
      addToast({ title: 'Save failed', description: (err as Error).message, color: 'danger' });
    } finally {
      setSaving(false);
    }
  };

  const reset = () => setDraft(base);

  return (
    <div className="glass space-y-5 p-5">
      <div>
        <p className="text-sm font-semibold text-slate-800">Per-page prices (₱)</p>
        <p className="mt-0.5 text-xs text-slate-500">
          What the kiosk charges per page. Change these when supply costs move — the kiosk applies
          the new rates and its Print Quality / Copy Quality options update to match, no restart.
          {updatedAt ? ` Last changed ${new Date(updatedAt).toLocaleString()}.` : ''}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[26rem] border-separate border-spacing-y-2 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="pr-4 font-medium">Service · Tier</th>
              <th className="px-2 font-medium">Black &amp; White</th>
              <th className="px-2 font-medium">Colour</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(({ group, tier, label }) => (
              <tr key={`${group}.${tier}`}>
                <td className="pr-4 font-medium text-slate-700">{label}</td>
                <td className="px-2">
                  <Input
                    type="number"
                    aria-label={`${label} black and white price`}
                    value={draft[`${group}.${tier}.bw`] ?? ''}
                    onValueChange={(v) => set(`${group}.${tier}.bw`, v)}
                    min={0}
                    step={0.25}
                    startContent={<span className="text-xs text-slate-400">₱</span>}
                    size="sm"
                    className="max-w-[9rem]"
                  />
                </td>
                <td className="px-2">
                  <Input
                    type="number"
                    aria-label={`${label} colour price`}
                    value={draft[`${group}.${tier}.color`] ?? ''}
                    onValueChange={(v) => set(`${group}.${tier}.color`, v)}
                    min={0}
                    step={0.25}
                    startContent={<span className="text-xs text-slate-400">₱</span>}
                    size="sm"
                    className="max-w-[9rem]"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Button color="primary" size="sm" onPress={save} isLoading={saving} isDisabled={!dirty}>
          Save prices
        </Button>
        <Button size="sm" variant="flat" onPress={reset} isDisabled={!dirty || saving}>
          Reset
        </Button>
        <span className="text-xs text-slate-400">
          Scanning is free and not priced here.
        </span>
      </div>
    </div>
  );
}
