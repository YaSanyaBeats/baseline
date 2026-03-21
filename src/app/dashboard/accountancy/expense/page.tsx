import { redirect } from 'next/navigation';

/** Список расходов объединён с доходами в «Транзакции». */
export default function ExpenseListRedirectPage() {
    redirect('/dashboard/accountancy/transactions?kind=expense');
}
