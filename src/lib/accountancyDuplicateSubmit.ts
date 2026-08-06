import { addExpense } from '@/lib/expenses';
import { addIncome } from '@/lib/incomes';
import type { CommonResponse, Expense, Income, ExistingDuplicateRow } from '@/lib/types';

export type DuplicateConflictInfo = {
    category: string;
    existingAmount: number;
    existingLineTotal: number;
    existingDuplicates: ExistingDuplicateRow[];
};

export type DuplicateConflictChoice = 'skip' | 'add';

export type SubmitWithDuplicateOptions = {
    allowDuplicate?: boolean;
    onDuplicateConflict?: (info: DuplicateConflictInfo) => Promise<DuplicateConflictChoice>;
};

export type SubmitWithDuplicateResult = CommonResponse & {
    skipped?: boolean;
};

function isForbidDuplicatesResponse(res: CommonResponse): boolean {
    return res.code === 'FORBID_DUPLICATES';
}

function toConflictInfo(res: CommonResponse, category: string): DuplicateConflictInfo {
    const existingAmount = res.existingAmount ?? 0;
    const existingLineTotal = res.existingLineTotal ?? res.existingAmount ?? 0;
    const existingDuplicates =
        res.existingDuplicates && res.existingDuplicates.length > 0
            ? res.existingDuplicates
            : [
                  {
                      objectId: 0,
                      objectName: '',
                      roomName: '—',
                      amount: existingAmount,
                      lineTotal: existingLineTotal,
                  },
              ];
    return {
        category,
        existingAmount,
        existingLineTotal,
        existingDuplicates,
    };
}

async function handleDuplicateConflict<T extends Expense | Income>(
    payload: T,
    category: string,
    res: CommonResponse,
    submit: (data: T, allowDuplicate?: boolean) => Promise<CommonResponse>,
    opts?: SubmitWithDuplicateOptions,
): Promise<SubmitWithDuplicateResult> {
    if (!isForbidDuplicatesResponse(res) || !opts?.onDuplicateConflict) {
        return res;
    }

    const choice = await opts.onDuplicateConflict(toConflictInfo(res, category));
    if (choice === 'skip') {
        return { success: true, skipped: true, message: '' };
    }

    return submit(payload, true);
}

export async function addExpenseHandlingDuplicate(
    expense: Expense,
    opts?: SubmitWithDuplicateOptions,
): Promise<SubmitWithDuplicateResult> {
    const res = await addExpense(expense, { allowDuplicate: opts?.allowDuplicate });
    if (!isForbidDuplicatesResponse(res)) return res;
    return handleDuplicateConflict(expense, expense.category, res, (data, allowDuplicate) =>
        addExpense(data, { allowDuplicate }),
    opts);
}

export function isTransactionAdded(res: SubmitWithDuplicateResult): boolean {
    return Boolean(res.success && !res.skipped);
}

export function isTransactionFailed(res: SubmitWithDuplicateResult): boolean {
    return !res.success;
}

export async function addIncomeHandlingDuplicate(
    income: Income,
    opts?: SubmitWithDuplicateOptions,
): Promise<SubmitWithDuplicateResult> {
    const res = await addIncome(income, { allowDuplicate: opts?.allowDuplicate });
    if (!isForbidDuplicatesResponse(res)) return res;
    return handleDuplicateConflict(income, income.category, res, (data, allowDuplicate) =>
        addIncome(data, { allowDuplicate }),
    opts);
}
