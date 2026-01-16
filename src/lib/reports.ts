import axios from 'axios';
import { CommonResponse, Report } from './types';
import { getApiUrl } from './api-client';

export async function getReports(): Promise<Report[]> {
    const response = await axios.get(getApiUrl('reports'));
    return response.data;
}

export async function addReport(report: Report): Promise<CommonResponse> {
    const response = await axios.post(getApiUrl('reports'), {
        params: {
            report: report
        }
    });
    return response.data;
}
