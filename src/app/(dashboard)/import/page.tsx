// Import wizard — not yet implemented
export default function ImportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-brennan-text">Import Rebate Data</h1>
        <p className="mt-1 text-sm text-gray-500">
          Upload an Excel or CSV file to import rebate records
        </p>
      </div>

      {/* Planned workflow steps */}
      <div className="flex items-center gap-2">
        <Step number={1} label="Upload File" />
        <StepConnector />
        <Step number={2} label="Map Columns" />
        <StepConnector />
        <Step number={3} label="Review & Validate" />
        <StepConnector />
        <Step number={4} label="Confirm" />
      </div>

      {/* Coming soon notice */}
      <div className="rounded-xl border-2 border-dashed border-brennan-border bg-white p-16 text-center">
        <UploadIcon className="mx-auto h-12 w-12 text-brennan-border" />
        <p className="mt-4 text-lg font-medium text-brennan-text">
          Import Coming Soon
        </p>
        <p className="mt-2 max-w-md mx-auto text-sm text-gray-500">
          The import pipeline is under development. It will support Excel (.xlsx) and CSV files
          with column mapping, validation preview, and batch processing.
        </p>
        <p className="mt-4 text-xs text-gray-400">
          For now, please add records manually using the New Record button on the Records or Distributor pages.
        </p>
      </div>
    </div>
  );
}

function Step({ number, label }: { number: number; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brennan-light text-sm font-medium text-gray-500">
        {number}
      </div>
      <span className="text-sm text-gray-500">{label}</span>
    </div>
  );
}

function StepConnector() {
  return <div className="h-px w-8 bg-brennan-border" />;
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
    </svg>
  );
}
