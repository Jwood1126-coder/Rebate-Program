import { readdir } from 'fs/promises';
import path from 'path';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function TestDataPage() {
  const testDataDir = path.join(process.cwd(), 'public', 'test-data');
  const rootPublic = path.join(process.cwd(), 'public');

  let testFiles: string[] = [];
  try {
    testFiles = (await readdir(testDataDir)).filter(f => f.endsWith('.xlsx') || f.endsWith('.csv'));
  } catch { /* dir may not exist */ }

  let rootFiles: string[] = [];
  try {
    rootFiles = (await readdir(rootPublic)).filter(f => f.startsWith('sample-') && (f.endsWith('.xlsx') || f.endsWith('.csv')));
  } catch { /* */ }

  const contractFiles = testFiles.filter(f => f.includes('contract') || f.includes('spa'));
  const claimFiles = [...testFiles.filter(f => f.includes('claim')), ...rootFiles.filter(f => f.includes('claim'))];
  const posFiles = testFiles.filter(f => f.includes('pos'));

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brennan-text">Test Data Files</h1>
        <p className="mt-1 text-sm text-gray-500">Download these files to test the full workflow.</p>
      </div>

      <Section title="Contract Files" subtitle="Upload via Create Contract page">
        {contractFiles.map(f => (
          <FileRow key={f} name={f} href={`/api/download/test-data/${f}`} />
        ))}
        <Hint text='AIT contract-104040: map "Part Number" → Item, "7/8 Price" → Price. Distributor=AIT, End User "QRS"/"Quality Railcar Solutions", Start=2026-01-01, Plan=QRS' />
        <Hint text='FAS SPA file: map "Supplier P/N" → Item, "Agreement Price" → Price. Distributor=FAS, End User "BAYSHORE"/"Bayshore", Start=2026-01-01, Plan=SPA' />
        <Hint text='Motion file: map "ITEM_NUMBER" → Item, "Motion Net" → Price. Distributor=MOTION, End User=LINK-BELT, Start=2026-01-01, Plan=OSW' />
        <Hint text='HSC contract (2026-03-17): map "Part Number" → Item, "Rebate Price" → Price. Distributor=HSC, End User=TEREX, Start=2026-03-01, Plan=FIT' />
        <Hint text='TIPCO contract (2026-03-17): map "Item Number" → Item, "Price" → Price. Distributor=TIPCO, End User=KUBOTA, Start=2026-03-01, Plan=SS' />
      </Section>

      <Section title="Claim Files" subtitle="Upload via Reconciliation page">
        {claimFiles.map(f => {
          const isRoot = rootFiles.includes(f);
          return <FileRow key={f} name={f} href={isRoot ? `/api/download/test-data/${f}` : `/api/download/test-data/${f}`} />;
        })}
        <Hint text="FAS claim (Feb): Distributor=FAS, Period=2026-02. Expect 5 matches + 6 exceptions." />
        <Hint text="Motion claim (Feb): Distributor=MOTION, Period=2026-02. Expect 7 matches + 5 exceptions." />
        <Hint text="FAS claim (Mar): Distributor=FAS, Period=2026-03. 6 matches + CLM-001 price mismatch + CLM-006 unknown item." />
        <Hint text="Motion claim (Mar): Distributor=MOTION, Period=2026-03. 5 matches + CLM-001 price mismatch + CLM-003 item not in contract." />
        <Hint text="HSC claim (Mar): Distributor=HSC, Period=2026-03. 5 matches + CLM-001 + CLM-003 + CLM-006." />
        <Hint text="AIT claim (Mar): Distributor=AIT, Period=2026-03. 4 matches + CLM-001 + CLM-004 contract not found + CLM-006." />
        <Hint text="LGG claim (Mar): Distributor=LGG, Period=2026-03. 4 matches + CLM-001 + CLM-009 duplicate claim line." />
        <Hint text="TIPCO claim (Mar): Distributor=TIPCO, Period=2026-03. 4 matches + CLM-001 + CLM-003." />
      </Section>

      <Section title="POS Files" subtitle='Attach via "+ Add POS" on a reconciliation run'>
        {posFiles.map(f => (
          <FileRow key={f} name={f} href={`/api/download/test-data/${f}`} />
        ))}
        <Hint text="FAS POS (Feb): attach to FAS Feb 2026 run, re-validate. Expect CLM-010, CLM-011 warnings." />
        <Hint text="Motion POS (Feb): attach to MOTION Feb 2026 run, re-validate. Expect CLM-010, CLM-011, CLM-012 warnings." />
        <Hint text="FAS POS (Mar): attach to FAS Mar 2026 run, re-validate. CLM-011 qty mismatch on 2403-16-16." />
        <Hint text="Motion POS (Mar): attach to MOTION Mar 2026 run, re-validate. CLM-012 price mismatch." />
        <Hint text="HSC POS (Mar): attach to HSC Mar 2026 run. CLM-011 qty mismatch on 6800-08-08." />
        <Hint text="AIT POS (Mar): attach to AIT Mar 2026 run. CLM-011 qty mismatch on SS-0808." />
        <Hint text="LGG POS (Mar): attach to LGG Mar 2026 run. Clean match — no POS exceptions expected." />
        <Hint text="TIPCO POS (Mar): attach to TIPCO Mar 2026 run. CLM-012 price mismatch on 7000-12." />
      </Section>

      <div className="rounded-lg border border-brennan-border bg-white p-5 text-sm text-gray-600 space-y-2">
        <p className="font-semibold text-brennan-text">Suggested Walkthrough</p>
        <ol className="list-decimal pl-5 space-y-1 text-xs">
          <li>Login as <code className="bg-gray-100 px-1 rounded">jwood / manager123</code></li>
          <li>Browse Records page — filter by distributor, status, date range (107 seed records across 6 distributors)</li>
          <li>Browse Contracts page — 12 contracts, mix of active/expired</li>
          <li>Create Contract → upload HSC contract file → map columns → preview → create</li>
          <li>Reconciliation → upload HSC Mar 2026 claim → Validate → review 3 exceptions</li>
          <li>Reconciliation → upload FAS Mar 2026 claim → Validate → review exceptions</li>
          <li>Try bulk approve/reject on a run with multiple exceptions</li>
          <li>Commit a reviewed run → check Records page for new/updated records</li>
          <li>Try FAS Feb claim + POS file workflow (attach POS → re-validate → POS warnings)</li>
          <li>Check Audit Log for all activity</li>
          <li>Check Dashboard for metric cards and expiring-soon records</li>
        </ol>
      </div>

      <p className="text-xs text-gray-400 text-center">
        <Link href="/" className="hover:underline">← Back to Dashboard</Link>
      </p>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-brennan-border bg-white overflow-hidden">
      <div className="border-b border-brennan-border px-5 py-3">
        <h2 className="text-base font-semibold text-brennan-text">{title}</h2>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
      <div className="px-5 py-3 space-y-2">{children}</div>
    </div>
  );
}

function FileRow({ name, href }: { name: string; href: string }) {
  return (
    <a
      href={href}
      download={name}
      className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-2.5 hover:bg-gray-50 transition-colors"
    >
      <svg className="h-5 w-5 text-green-600 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
      <span className="text-sm font-medium text-brennan-blue">{name}</span>
    </a>
  );
}

function Hint({ text }: { text: string }) {
  return <p className="text-xs text-gray-400 pl-1">→ {text}</p>;
}
