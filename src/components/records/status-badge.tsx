import { RECORD_STATUSES, type RecordStatus } from "@/lib/constants/statuses";

const statusConfig: Record<RecordStatus, { label: string; classes: string }> = {
  [RECORD_STATUSES.ACTIVE]: {
    label: "Active",
    classes: "bg-green-100 text-green-800 border-green-200",
  },
  [RECORD_STATUSES.EXPIRED]: {
    label: "Expired",
    classes: "bg-gray-100 text-gray-600 border-gray-200",
  },
  [RECORD_STATUSES.FUTURE]: {
    label: "Future",
    classes: "bg-blue-100 text-blue-800 border-blue-200",
  },
  [RECORD_STATUSES.SUPERSEDED]: {
    label: "Superseded",
    classes: "bg-orange-100 text-orange-800 border-orange-200",
  },
  [RECORD_STATUSES.DRAFT]: {
    label: "Draft",
    classes: "bg-yellow-100 text-yellow-800 border-yellow-200",
  },
  [RECORD_STATUSES.CANCELLED]: {
    label: "Cancelled",
    classes: "bg-red-100 text-red-800 border-red-200",
  },
};

export function StatusBadge({ status }: { status: RecordStatus }) {
  const config = statusConfig[status] ?? statusConfig.active;

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${config.classes}`}
    >
      {config.label}
    </span>
  );
}
