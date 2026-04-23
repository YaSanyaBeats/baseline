import ExpenseEditForm from '@/components/accountancy/ExpenseEditForm';

export default function Page() {
    return (
        <ExpenseEditForm notFoundRedirect="/dashboard/cashflow" requireMatchingUserCashflow />
    );
}
