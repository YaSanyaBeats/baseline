import { redirect } from 'next/navigation';

/** Список доходов объединён с расходами в «Транзакции». */
export default function IncomeListRedirectPage() {
    redirect('/dashboard/accountancy/transactions?kind=income');
}
