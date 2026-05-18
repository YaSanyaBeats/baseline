import { Suspense } from 'react';
import TransactionAddForm from '@/components/accountancy/TransactionAddForm';

export default function Page() {
    return (
        <Suspense fallback={null}>
            <TransactionAddForm type="expense" attachCashflowId />
        </Suspense>
    );
}
