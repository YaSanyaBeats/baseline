function monthOptionLabel(t: (key: string) => string, value: string): string {
    const [yStr, mStr] = value.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    const monthName = t(`accountancy.months.${m}`);
    return `${monthName} ${y}`;
}

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
        options.push({ value, label: monthOptionLabel(t, value) });
    }
    return options;
}

export function buildMonthOptionsFromKeys(
    t: (key: string) => string,
    monthKeys: string[],
): { value: string; label: string }[] {
    return monthKeys.map((value) => ({
        value,
        label: monthOptionLabel(t, value),
    }));
}
