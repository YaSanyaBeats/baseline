import axios from 'axios';
import { CommonResponse, Report } from './types';
import { getApiUrl } from './api-client';

export async function getReports(): Promise<Report[]> {
    const response = await axios.get(getApiUrl('reports'));
    return response.data;
}

export async function getReportByCriteria(objectId: number, ownerId: string, month: number, year: number): Promise<Report | null> {
    const response = await axios.get(getApiUrl('reports'), {
        params: {
            objectId,
            ownerId,
            month,
            year
        }
    });
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

export async function updateReport(report: Report): Promise<CommonResponse> {
    const response = await axios.post(getApiUrl('reports/editReport'), {
        params: {
            report: report
        }
    });
    return response.data;
}

export async function deleteReport(id: string): Promise<CommonResponse> {
    const response = await axios.delete(getApiUrl('reports/deleteReport'), {
        params: {
            id: id
        }
    });
    return response.data;
}
