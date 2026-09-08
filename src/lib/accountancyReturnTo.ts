/** Безопасный путь возврата только внутри дашборда. */
export function parseSafeDashboardReturnTo(raw: string | null | undefined): string | null {
    const value = (raw ?? '').trim();
    if (!value.startsWith('/dashboard/')) return null;
    if (value.startsWith('//')) return null;
    if (/^[a-zA-Z][a-zA-Z+\-.]*:/.test(value)) return null;
    return value;
}

export function withReturnTo(href: string, returnTo: string | null | undefined): string {
    const safe = parseSafeDashboardReturnTo(returnTo);
    if (!safe) return href;
    const qIndex = href.indexOf('?');
    const path = qIndex === -1 ? href : href.slice(0, qIndex);
    const search = qIndex === -1 ? '' : href.slice(qIndex + 1);
    const params = new URLSearchParams(search);
    params.set('returnTo', safe);
    const qs = params.toString();
    return qs ? `${path}?${qs}` : path;
}

export function navigateReturnOrBack(
    router: { push: (href: string) => void; back: () => void },
    returnTo: string | null | undefined,
): void {
    const safe = parseSafeDashboardReturnTo(returnTo);
    if (safe) {
        router.push(safe);
        return;
    }
    router.back();
}
