/**
 * Contract Update Diff Engine — Item + Price Comparison
 *
 * Scope: compares uploaded item/price lists against existing contract records.
 * Detects price changes, new items (additions), and missing items (removals in
 * snapshot mode). Does NOT compare per-row dates, plan assignments, or other
 * row-level fields — those require manual review or future extension.
 *
 * Key design decisions:
 * - Reuses parseSimpleContractFile for file parsing (two-column: item + price)
 * - Normalizes item identity via itemId where possible (falls back to string match)
 * - Single-plan contracts: plan inferred automatically
 * - Multi-plan contracts: planCode hint recommended, or diffs marked ambiguous
 * - Snapshot mode: missing rows → removed diffs; Delta mode: missing rows ignored
 * - Unchanged rows are counted but NOT stored as diff rows
 */

import { prisma } from "@/lib/db/client";
import { parseSimpleContractFile, type ContractColumnMapping } from "./contract-import.service";
import {
  DIFF_TYPES,
  FILE_MODES,
  MATCH_STATUSES,
  CONTRACT_UPDATE_STATUSES,
} from "@/lib/constants/statuses";
import type { FileMode } from "@/lib/constants/statuses";
import crypto from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContractUpdateInput {
  contractId: number;
  fileMode: FileMode;
  effectiveDate?: string; // ISO date, optional run-level default
  columnMapping?: ContractColumnMapping;
  planCode?: string; // Required for multi-plan contracts if not in file
}

export interface StagedDiff {
  diffType: string;
  itemId: number | null;
  itemNumber: string;
  rebatePlanId: number | null;
  planCode: string | null;
  matchedRecordId: number | null;
  oldPrice: number | null;
  newPrice: number | null;
  matchStatus: string;
  ambiguityReason: string | null;
}

export interface StageResult {
  success: boolean;
  runId: number | null;
  totalRows: number;
  unchangedCount: number;
  changedCount: number;
  addedCount: number;
  removedCount: number;
  errors: string[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Internal: active record shape from DB
// ---------------------------------------------------------------------------

interface ExistingRecord {
  id: number;
  rebatePlanId: number;
  itemId: number;
  itemNumber: string; // from item relation
  rebatePrice: number;
  planCode: string;  // from plan relation
}

// ---------------------------------------------------------------------------
// Main: stage a contract update
// ---------------------------------------------------------------------------

/**
 * Parse an uploaded file and diff it against the existing contract records.
 * Creates a ContractUpdateRun with ContractUpdateDiff rows for review.
 */
export async function stageContractUpdate(
  fileBuffer: Buffer,
  fileName: string,
  input: ContractUpdateInput,
  userId: number,
): Promise<StageResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Validate contract exists
  const contract = await prisma.contract.findUnique({
    where: { id: input.contractId },
    select: {
      id: true,
      contractNumber: true,
      rebatePlans: {
        where: { status: "active" },
        select: { id: true, planCode: true },
      },
    },
  });

  if (!contract) {
    return fail(["Contract not found."]);
  }

  const plans = contract.rebatePlans;
  if (plans.length === 0) {
    return fail(["Contract has no active rebate plans."]);
  }

  // 2. Parse the file
  const parseResult = parseSimpleContractFile(fileBuffer, fileName, input.columnMapping, contract.contractNumber);
  if (parseResult.items.length === 0) {
    return fail(parseResult.errors.length > 0 ? parseResult.errors : ["File contains no valid rows."]);
  }
  errors.push(...parseResult.errors);
  warnings.push(...parseResult.warnings);

  // 3. Load all active records for this contract (across all plans)
  const planIds = plans.map(p => p.id);
  const existingRecords = await loadActiveRecords(planIds);

  // 4. Determine plan resolution strategy
  const isSinglePlan = plans.length === 1;
  const targetPlanId = isSinglePlan ? plans[0].id : null;
  const targetPlanCode = isSinglePlan ? plans[0].planCode : null;

  // If multi-plan and caller provided a planCode, resolve it
  let resolvedMultiPlanId: number | null = null;
  if (!isSinglePlan && input.planCode) {
    const matchedPlan = plans.find(p => p.planCode.toUpperCase() === input.planCode!.toUpperCase());
    if (matchedPlan) {
      resolvedMultiPlanId = matchedPlan.id;
    } else {
      warnings.push(`Provided plan code "${input.planCode}" not found in contract. Diffs will be marked ambiguous.`);
    }
  }

  // 5. Build item lookup: normalize itemNumber → itemId
  const allItemNumbers = parseResult.items.map(i => i.itemNumber);
  const knownItems = await prisma.item.findMany({
    where: { itemNumber: { in: allItemNumbers } },
    select: { id: true, itemNumber: true },
  });
  const itemLookup = new Map(knownItems.map(i => [i.itemNumber.toUpperCase(), i]));

  // 6. Build existing-record index keyed by itemId (or itemNumber if no itemId)
  // For each item, there may be records in multiple plans
  const recordsByItemId = new Map<number, ExistingRecord[]>();
  for (const rec of existingRecords) {
    const list = recordsByItemId.get(rec.itemId) || [];
    list.push(rec);
    recordsByItemId.set(rec.itemId, list);
  }

  // Track which existing records were matched (for snapshot removal detection)
  const matchedRecordIds = new Set<number>();

  // If a run-level plan hint is set (single plan or explicit planCode),
  // it scopes all matching and snapshot removal to that plan only.
  const hintedPlanId = targetPlanId ?? resolvedMultiPlanId;

  // 7. Diff each file row against existing records
  const diffs: StagedDiff[] = [];
  let unchangedCount = 0;

  for (const fileItem of parseResult.items) {
    const normalizedKey = fileItem.itemNumber.toUpperCase();
    const knownItem = itemLookup.get(normalizedKey);
    const itemId = knownItem?.id ?? null;

    // Find matching existing records for this item
    const allExistingForItem = itemId ? (recordsByItemId.get(itemId) || []) : [];

    // If a plan hint is set, scope matches to that plan only.
    // The hint is authoritative: if the item doesn't exist in the hinted plan,
    // it's treated as a new addition to that plan — never silently matched to
    // a different plan the user didn't intend.
    const existingForItem = hintedPlanId
      ? allExistingForItem.filter(r => r.rebatePlanId === hintedPlanId)
      : allExistingForItem;

    if (existingForItem.length === 0) {
      // ADDED: item not in the target plan (or not in any plan if no hint)
      const planId = hintedPlanId;
      const planCodeVal = targetPlanCode ?? input.planCode ?? null;
      const matchStatus = planId ? MATCH_STATUSES.AUTO : MATCH_STATUSES.AMBIGUOUS;
      const ambiguity = !planId && plans.length > 1
        ? `New item with ${plans.length} plans available — plan assignment required`
        : null;

      diffs.push({
        diffType: DIFF_TYPES.ADDED,
        itemId,
        itemNumber: fileItem.itemNumber,
        rebatePlanId: planId,
        planCode: planCodeVal,
        matchedRecordId: null,
        oldPrice: null,
        newPrice: fileItem.price,
        matchStatus,
        ambiguityReason: ambiguity,
      });
      continue;
    }

    // Item exists in the target scope — find the best matching record
    const matchResult = matchRecord(existingForItem, fileItem.price, targetPlanId, resolvedMultiPlanId);

    if (matchResult.matchStatus === MATCH_STATUSES.AMBIGUOUS) {
      // Ambiguous: ALWAYS produce a reviewable diff regardless of price.
      // Do NOT mark any candidate as matched — snapshot mode must not
      // infer removals from unresolved ambiguity.
      diffs.push({
        diffType: DIFF_TYPES.CHANGED,
        itemId,
        itemNumber: fileItem.itemNumber,
        rebatePlanId: matchResult.record.rebatePlanId,
        planCode: matchResult.record.planCode,
        matchedRecordId: matchResult.record.id,
        oldPrice: matchResult.record.rebatePrice,
        newPrice: fileItem.price,
        matchStatus: matchResult.matchStatus,
        ambiguityReason: matchResult.ambiguityReason,
      });
      // Mark ALL candidate records as matched so snapshot mode doesn't
      // create false "removed" diffs for the other candidates.
      for (const candidate of existingForItem) {
        matchedRecordIds.add(candidate.id);
      }
    } else {
      // Unambiguous match
      matchedRecordIds.add(matchResult.record.id);

      if (matchResult.priceChanged) {
        diffs.push({
          diffType: DIFF_TYPES.CHANGED,
          itemId,
          itemNumber: fileItem.itemNumber,
          rebatePlanId: matchResult.record.rebatePlanId,
          planCode: matchResult.record.planCode,
          matchedRecordId: matchResult.record.id,
          oldPrice: matchResult.record.rebatePrice,
          newPrice: fileItem.price,
          matchStatus: matchResult.matchStatus,
          ambiguityReason: matchResult.ambiguityReason,
        });
      } else {
        // UNCHANGED — count but don't store
        unchangedCount++;
      }
    }
  }

  // 8. Snapshot mode: detect removed rows (in contract but not in file)
  // When a plan hint is set, only detect removals within that plan's scope.
  // A SEAL-focused upload should not generate removals for OSW items.
  if (input.fileMode === FILE_MODES.SNAPSHOT) {
    for (const rec of existingRecords) {
      if (hintedPlanId && rec.rebatePlanId !== hintedPlanId) continue;
      if (!matchedRecordIds.has(rec.id)) {
        diffs.push({
          diffType: DIFF_TYPES.REMOVED,
          itemId: rec.itemId,
          itemNumber: rec.itemNumber,
          rebatePlanId: rec.rebatePlanId,
          planCode: rec.planCode,
          matchedRecordId: rec.id,
          oldPrice: rec.rebatePrice,
          newPrice: null,
          matchStatus: MATCH_STATUSES.AUTO,
          ambiguityReason: null,
        });
      }
    }
  }

  // 9. Categorize counts
  const changedCount = diffs.filter(d => d.diffType === DIFF_TYPES.CHANGED).length;
  const addedCount = diffs.filter(d => d.diffType === DIFF_TYPES.ADDED).length;
  const removedCount = diffs.filter(d => d.diffType === DIFF_TYPES.REMOVED).length;

  if (diffs.length === 0 && errors.length === 0) {
    warnings.push("No differences found — all rows match existing contract records.");
  }

  // 10. Persist: create run + diffs in a transaction
  const fileHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");

  const run = await prisma.$transaction(async (tx) => {
    const newRun = await tx.contractUpdateRun.create({
      data: {
        contractId: input.contractId,
        fileMode: input.fileMode,
        fileName,
        fileHash,
        effectiveDate: input.effectiveDate ? new Date(input.effectiveDate) : null,
        status: CONTRACT_UPDATE_STATUSES.STAGED,
        totalRows: parseResult.items.length,
        unchangedCount,
        changedCount,
        addedCount,
        removedCount,
        runById: userId,
      },
    });

    if (diffs.length > 0) {
      await tx.contractUpdateDiff.createMany({
        data: diffs.map(d => ({
          runId: newRun.id,
          diffType: d.diffType,
          itemId: d.itemId,
          itemNumber: d.itemNumber,
          rebatePlanId: d.rebatePlanId,
          planCode: d.planCode,
          matchedRecordId: d.matchedRecordId,
          oldPrice: d.oldPrice,
          newPrice: d.newPrice,
          matchStatus: d.matchStatus,
          ambiguityReason: d.ambiguityReason,
        })),
      });
    }

    return newRun;
  });

  return {
    success: true,
    runId: run.id,
    totalRows: parseResult.items.length,
    unchangedCount,
    changedCount,
    addedCount,
    removedCount,
    errors,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Get run details (for review UI)
// ---------------------------------------------------------------------------

export async function getContractUpdateRun(runId: number) {
  return prisma.contractUpdateRun.findUnique({
    where: { id: runId },
    include: {
      contract: {
        select: {
          id: true,
          contractNumber: true,
          contractType: true,
          distributor: { select: { code: true, name: true } },
          endUser: { select: { name: true } },
        },
      },
      runBy: { select: { displayName: true } },
      diffs: {
        orderBy: [{ diffType: "asc" }, { itemNumber: "asc" }],
      },
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fail(errors: string[]): StageResult {
  return {
    success: false,
    runId: null,
    totalRows: 0,
    unchangedCount: 0,
    changedCount: 0,
    addedCount: 0,
    removedCount: 0,
    errors,
    warnings: [],
  };
}

/**
 * Load current operative records for the given plan IDs.
 *
 * "Current operative" means:
 * - Not superseded (supersededById = null)
 * - Not cancelled or draft (manual statuses)
 * - Not expired (endDate >= today, or null/open-ended)
 *
 * This excludes historical expired records so that snapshot mode doesn't
 * generate false "removed" diffs for records that already naturally ended.
 * Active and future records are both included.
 */
async function loadActiveRecords(planIds: number[]): Promise<ExistingRecord[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const records = await prisma.rebateRecord.findMany({
    where: {
      rebatePlanId: { in: planIds },
      supersededById: null,
      status: { notIn: ["draft", "cancelled"] },
      OR: [
        { endDate: null },            // open-ended
        { endDate: { gte: today } },   // active or future
      ],
    },
    include: {
      item: { select: { itemNumber: true } },
      rebatePlan: { select: { planCode: true } },
    },
  });

  return records.map(r => ({
    id: r.id,
    rebatePlanId: r.rebatePlanId,
    itemId: r.itemId,
    itemNumber: r.item.itemNumber,
    rebatePrice: Number(r.rebatePrice),
    planCode: r.rebatePlan.planCode,
  }));
}

/** Round to DB precision (DECIMAL(12,4)) for truthful comparison. */
function pricesEqual(dbPrice: number, filePrice: number): boolean {
  return Math.round(dbPrice * 10000) === Math.round(filePrice * 10000);
}

/**
 * Match a file row to the best existing record.
 *
 * Strategy:
 * - If single plan (targetPlanId set), match is unambiguous
 * - If multi-plan with resolvedMultiPlanId, prefer that plan
 * - If multi-plan with no hint, and item exists in exactly one plan, use it
 * - If item exists in multiple plans, mark ambiguous
 */
function matchRecord(
  records: ExistingRecord[],
  newPrice: number,
  targetPlanId: number | null,
  resolvedMultiPlanId: number | null,
): {
  record: ExistingRecord;
  priceChanged: boolean;
  matchStatus: string;
  ambiguityReason: string | null;
} {
  // Single plan — always unambiguous
  if (targetPlanId) {
    const rec = records.find(r => r.rebatePlanId === targetPlanId) || records[0];
    return {
      record: rec,
      priceChanged: !pricesEqual(rec.rebatePrice, newPrice),
      matchStatus: MATCH_STATUSES.AUTO,
      ambiguityReason: null,
    };
  }

  // Multi-plan with explicit plan hint
  if (resolvedMultiPlanId) {
    const rec = records.find(r => r.rebatePlanId === resolvedMultiPlanId);
    if (rec) {
      return {
        record: rec,
        priceChanged: !pricesEqual(rec.rebatePrice, newPrice),
        matchStatus: MATCH_STATUSES.AUTO,
        ambiguityReason: null,
      };
    }
    // Hint didn't match any record for this item — fall through to ambiguous
  }

  // Item exists in exactly one plan — unambiguous
  const uniquePlanIds = new Set(records.map(r => r.rebatePlanId));
  if (uniquePlanIds.size === 1) {
    const rec = records[0];
    return {
      record: rec,
      priceChanged: !pricesEqual(rec.rebatePrice, newPrice),
      matchStatus: MATCH_STATUSES.AUTO,
      ambiguityReason: null,
    };
  }

  // Item exists in multiple plans — ambiguous
  const planCodes = [...new Set(records.map(r => r.planCode))].join(", ");
  return {
    record: records[0], // pick first as provisional
    priceChanged: !pricesEqual(records[0].rebatePrice, newPrice),
    matchStatus: MATCH_STATUSES.AMBIGUOUS,
    ambiguityReason: `Item exists in multiple plans: ${planCodes}`,
  };
}
