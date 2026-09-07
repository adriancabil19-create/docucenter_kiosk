import type { Metadata } from 'next';
import {
  LEGAL_SECTIONS,
  LEGAL_EFFECTIVE,
  OPERATOR_DETAILS,
} from '@/lib/legal-content';

export const metadata: Metadata = {
  title: 'Legal & Privacy — DocuCenter Admin',
  description:
    'Privacy Policy, Terms & Conditions, Cookie Policy, and Refund Policy for the DocuCenter Kiosk.',
};

export default function LegalPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-slate-800">Legal &amp; Privacy</h1>
        <p className="mt-1 text-sm text-slate-600">{LEGAL_EFFECTIVE}</p>
        <p className="mt-2 text-sm text-slate-600">
          Plain-language summaries. The authoritative full texts are kept with the
          project under <code>docs/legal/</code> and are available by e-mail from{' '}
          <a
            className="font-medium text-accent-strong underline"
            href="mailto:adriancabil12@gmail.com"
          >
            adriancabil12@gmail.com
          </a>
          .
        </p>
      </header>

      <section aria-labelledby="operator-heading" className="glass p-5">
        <h2 id="operator-heading" className="text-base font-semibold text-slate-800">
          Business / Operator Details
        </h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {OPERATOR_DETAILS.map(({ label, value }) => (
            <div key={label}>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {label}
              </dt>
              <dd className="mt-0.5 text-sm text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {LEGAL_SECTIONS.map((s) => (
        <section key={s.id} aria-labelledby={`${s.id}-heading`} className="glass p-5">
          <h2
            id={`${s.id}-heading`}
            className="text-base font-semibold text-slate-800"
          >
            {s.title}
          </h2>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-700">
            {s.body}
          </p>
        </section>
      ))}

      <footer className="border-t border-white/50 pt-4 text-xs text-slate-500">
        DocuCenter · Developer / Operator: Charles Adrian L. Cabil ·{' '}
        <a className="underline" href="mailto:adriancabil12@gmail.com">
          adriancabil12@gmail.com
        </a>
        <br />
        Undergraduate thesis prototype — University of Cebu – Lapu-Lapu and Mandaue
        Campus.
      </footer>
    </div>
  );
}
