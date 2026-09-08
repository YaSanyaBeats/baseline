import { Suspense } from 'react';
import ExpenseEditForm from '@/components/accountancy/ExpenseEditForm';

export default function Page() {
    return (
        <Suspense fallback={null}>
            <ExpenseEditForm notFoundRedirect="/dashboard/accountancy/transactions?kind=expense" />
        </Suspense>
    );
}
