import axios from 'axios';
import { getApiUrl } from './api-client';
import type { RenameRoomStats } from './server/renameRoom';

export type RenameRoomResponse = {
    success: boolean;
    message?: string;
} & Partial<RenameRoomStats>;

export async function renameRoom(params: {
    objectId: number;
    oldRoomName: string;
    newRoomName: string;
}): Promise<RenameRoomResponse> {
    const response = await axios.post(getApiUrl('options/rename-room'), params);
    return response.data;
}
