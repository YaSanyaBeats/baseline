import axios from 'axios';
import { getApiUrl } from './api-client';
import type { AccountancyAttachment } from './types';

export interface UploadAttachmentsResponse {
    success: boolean;
    message?: string;
    attachments?: AccountancyAttachment[];
}

export async function uploadAccountancyAttachments(files: File[]): Promise<UploadAttachmentsResponse> {
    if (!files.length) return { success: true, attachments: [] };

    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));

    const response = await axios.post<UploadAttachmentsResponse>(
        getApiUrl('accountancy/upload'),
        formData,
        {
            headers: { 'Content-Type': 'multipart/form-data' },
            maxBodyLength: 25 * 1024 * 1024, // 25 MB
            maxContentLength: 25 * 1024 * 1024,
        },
    );

    return response.data;
}
