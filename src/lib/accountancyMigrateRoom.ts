import axios from 'axios';
import { getApiUrl } from './api-client';

export type MigrateTransactionsToRoomResponse = {
    success: boolean;
    message?: string;
    expensesUpdated?: number;
    incomesUpdated?: number;
    modifiedCount?: number;
};

export async function migrateTransactionsToRoom(params: {
    reportMonth: string;
    objectId: number;
    sourceRoomName: string;
    destinationRoomName: string;
    onlyBookingLinked?: boolean;
}): Promise<MigrateTransactionsToRoomResponse> {
    const response = await axios.post(getApiUrl('accountancy/migrate-transactions-room'), params);
    return response.data;
}
