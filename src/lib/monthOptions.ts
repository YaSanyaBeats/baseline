export function buildMonthOptions(
    t: (key: string) => string,
    count = 24
): { value: string; label: string }[] {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < count; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth() + 1;
        const value = `${y}-${String(m).padStart(2, '0')}`;
        const monthName = t(`accountancy.months.${m}`);
        options.push({ value, label: `${monthName} ${y}` });
    }
    return options;
}
