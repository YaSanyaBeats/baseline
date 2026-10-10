'use client';

import CashflowLedgerView from '@/components/accountancy/CashflowLedgerView';
import { useParams } from 'next/navigation';

export default function Page() {
    const params = useParams();
    const userId = typeof params.userId === 'string' ? params.userId : '';
    return <CashflowLedgerView userId={userId} variant="employee" />;
}
