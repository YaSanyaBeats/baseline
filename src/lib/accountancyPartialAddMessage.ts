/** Сообщение для snackbar при частичном сохранении пакета расходов/доходов. */
export function formatPartialTransactionAddWarning(
    t: (key: string) => string,
    kind: 'expense' | 'income',
    successCount: number,
    failures: { category: string; message: string }[],
): string {
    const total = successCount + failures.length;
    const head =
        kind === 'expense'
            ? `${t('accountancy.expensesAddedPartial')} (${successCount}/${total})`
            : `${t('accountancy.incomesAddedPartial')} (${successCount}/${total})`;
    const uniqueMsgs = [...new Set(failures.map((f) => f.message))];
    const reasonLine = `${t('accountancy.partialAddFailureReason')}: ${uniqueMsgs.join('; ')}`;
    const catNames = [...new Set(failures.map((f) => f.category).filter((c) => Boolean(c?.trim())))];
    const catLine =
        catNames.length > 0
            ? `${t('accountancy.partialAddBlockedCategories')}: ${catNames.join(', ')}`
            : '';
    return [head, reasonLine, catLine].filter(Boolean).join('\n');
}
