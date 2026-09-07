'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Tabs, Tab } from '@mui/material';
import { useTranslation } from '@/i18n/useTranslation';

const TABS = [
    { href: '/dashboard/pricing', key: 'desk' },
    { href: '/dashboard/pricing/compset', key: 'compset' },
    { href: '/dashboard/pricing/clusters', key: 'clusters' },
    { href: '/dashboard/pricing/temperature', key: 'temperature' },
    { href: '/dashboard/pricing/demand', key: 'demand' },
    { href: '/dashboard/pricing/journal', key: 'journal' },
] as const;

export default function PricingTabs() {
    const pathname = usePathname();
    const { t } = useTranslation();
    const current = TABS.find((tab) => tab.href === pathname)?.href || '/dashboard/pricing';

    return (
        <Tabs value={current} variant="scrollable" scrollButtons="auto">
            {TABS.map((tab) => (
                <Tab
                    key={tab.href}
                    value={tab.href}
                    label={t(`pricing.tabs.${tab.key}`)}
                    component={Link}
                    href={tab.href}
                />
            ))}
        </Tabs>
    );
}
