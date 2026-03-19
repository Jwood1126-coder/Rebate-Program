import { readdir } from 'fs/promises';
import path from 'path';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function TestDataPage() {
  const testDataDir = path.join(process.cwd(), 'public', 'test-data');

  let allFiles: string[] = [];
  try {
    allFiles = (await readdir(testDataDir))
      .filter(f => f.endsWith('.xlsx') || f.endsWith('.csv'))
      .sort();
  } catch { /* dir may not exist */ }

  const contractFiles = allFiles.filter(f => f.startsWith('CONTRACT'));
  const claimFiles = allFiles.filter(f => f.startsWith('CLAIM'));
  const posFiles = allFiles.filter(f => f.startsWith('POS'));
  const updateFiles = allFiles.filter(f => f.startsWith('UPDATE'));

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brennan-text">Test Data Files</h1>
        <p className="mt-1 text-sm text-gray-500">Download these files to test each workflow. Follow the steps in order.</p>
      </div>

      {/* Step 1 */}
      <Section
        step={1}
        title="Create Contracts"
        subtitle="Contracts → New Contract → Upload File tab"
        color="blue"
      >
        <p className="text-xs text-gray-500 mb-3">
          Upload each file to create a contract. Set the distributor, end user, contract number, and start date during creation.
        </p>
        <div className="space-y-1.5">
          {contractFiles.map(f => <FileRow key={f} name={f} />)}
        </div>
        <div className="mt-3 rounded-md bg-blue-50 border border-blue-100 px-3 py-2 text-xs text-blue-800">
          <span className="font-medium">Contract numbers to use:</span> FAS=101700, MOTION=102450, HSC=103200, AIT=104100, LGG=105100, TIPCO=106100
        </div>
      </Section>

      {/* Step 2 */}
      <Section
        step={2}
        title="Approve Contracts"
        subtitle="Click into each contract → click Approve"
        color="green"
      >
        <p className="text-xs text-gray-500">
          New contracts start as &quot;Pending Review&quot;. Click into each contract and approve it so claim data can be validated against it.
        </p>
      </Section>

      {/* Step 3 */}
      <Section
        step={3}
        title="Reconcile Claims"
        subtitle="Reconciliation → Upload for each distributor"
        color="amber"
      >
        <p className="text-xs text-gray-500 mb-3">
          Upload the CLAIM file for each distributor. Each file has some clean matches and some intentional exceptions (price mismatches, unknown items, etc.).
        </p>
        <div className="space-y-1.5">
          {claimFiles.map(f => <FileRow key={f} name={f} />)}
        </div>
      </Section>

      {/* Step 4 */}
      <Section
        step={4}
        title="Attach POS Data (Optional)"
        subtitle="During reconciliation → + Add POS on the run page"
        color="purple"
      >
        <p className="text-xs text-gray-500 mb-3">
          Optionally attach POS data during a reconciliation run to cross-check against claims.
        </p>
        <div className="space-y-1.5">
          {posFiles.map(f => <FileRow key={f} name={f} />)}
        </div>
      </Section>

      {/* Step 5 */}
      <Section
        step={5}
        title="Update Contracts"
        subtitle="Contract detail → Update button"
        color="orange"
      >
        <p className="text-xs text-gray-500 mb-3">
          Upload an updated price list to see what changed. Each file has price changes, new items, and/or removed items compared to the original contract.
        </p>
        <div className="space-y-1.5">
          {updateFiles.map(f => <FileRow key={f} name={f} />)}
        </div>
        {updateFiles.length > 0 && (
          <div className="mt-3 rounded-md bg-orange-50 border border-orange-100 px-3 py-2 text-xs text-orange-800">
            <span className="font-medium">Tip:</span> Use &quot;Complete list&quot; mode to also detect removed items. Use &quot;Only changes&quot; mode if the file only contains modifications.
          </div>
        )}
      </Section>

      {/* Login info */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-5 py-3 text-sm text-gray-600">
        <span className="font-medium">Login:</span>{' '}
        <code className="bg-white px-1.5 py-0.5 rounded border text-xs">admin / admin123</code>{' '}or{' '}
        <code className="bg-white px-1.5 py-0.5 rounded border text-xs">jwood / manager123</code>
      </div>

      <p className="text-xs text-gray-400 text-center">
        <Link href="/" className="hover:underline">← Back to Dashboard</Link>
      </p>
    </div>
  );
}

function Section({ step, title, subtitle, color, children }: {
  step: number;
  title: string;
  subtitle: string;
  color: string;
  children: React.ReactNode;
}) {
  const badgeColors: Record<string, string> = {
    blue: 'bg-blue-600',
    green: 'bg-green-600',
    amber: 'bg-amber-600',
    purple: 'bg-purple-600',
    orange: 'bg-orange-600',
  };
  return (
    <div className="rounded-xl border border-brennan-border bg-white overflow-hidden">
      <div className="border-b border-brennan-border px-5 py-3 flex items-center gap-3">
        <span className={`inline-flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold text-white ${badgeColors[color] || 'bg-gray-600'}`}>
          {step}
        </span>
        <div>
          <h2 className="text-base font-semibold text-brennan-text">{title}</h2>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function FileRow({ name }: { name: string }) {
  const href = `/test-data/${encodeURIComponent(name)}`;
  return (
    <a
      href={href}
      download={name}
      className="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-2.5 hover:bg-gray-50 transition-colors"
    >
      <svg className="h-5 w-5 text-brennan-blue shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
      <span className="text-sm font-medium text-brennan-text">{name}</span>
    </a>
  );
}
