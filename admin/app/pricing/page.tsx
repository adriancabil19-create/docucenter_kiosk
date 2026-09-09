import { getPricingSettings } from '@/lib/backend';
import type { PricingSettings } from '@/lib/types';
import { PricingSettingsForm } from '@/components/pricing-settings-form';

export const dynamic = 'force-dynamic';

export default async function PricingPage() {
  let settings: PricingSettings | null = null;
  try {
    settings = (await getPricingSettings()).settings;
  } catch {
    // Backend unavailable at SSR time — the form shows a load error.
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Pricing</h1>
        <p className="mt-1 text-sm text-slate-500">
          Set the per-page charges for printing and photocopying. Changes are pushed to every kiosk
          on its next poll (~2&nbsp;s) — the kiosk recalculates costs and relabels its quality
          options automatically, with no restart.
        </p>
      </div>

      <PricingSettingsForm initial={settings} />
    </div>
  );
}
