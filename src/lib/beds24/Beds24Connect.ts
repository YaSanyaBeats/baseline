import axios, { AxiosError, ResponseType } from 'axios';
import { getDB } from '../db/getDB';

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RATE_LIMIT_RETRIES = 8;
const MAX_RATE_LIMIT_WAIT_SEC = 360;

type RateLimitSnapshot = {
    remaining: number | null;
    resetsIn: number | null;
    requestCost: number | null;
};

function buildQueryString(params: Record<string, unknown>) {
    const queryParts = [];

    for (const key in params) {
        if (key === 'id' && Array.isArray(params.id)) {
            params.id.forEach((id: number) => {
                queryParts.push(`id=${encodeURIComponent(id)}`);
            });
        } else {
            queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(params[key]))}`);
        }
    }

    return queryParts.join('&');
}

function headerValue(headers: unknown, name: string): string | undefined {
    if (!headers || typeof headers !== 'object') return undefined;
    const bag = headers as { get?: (key: string) => unknown } & Record<string, unknown>;
    if (typeof bag.get === 'function') {
        const fromGetter = bag.get(name);
        if (fromGetter != null && fromGetter !== '') return String(fromGetter);
    }
    const raw = bag[name] ?? bag[name.toLowerCase()];
    if (raw == null || raw === '') return undefined;
    return String(raw);
}

function readNumberHeader(headers: unknown, names: string[]): number | null {
    for (const name of names) {
        const raw = headerValue(headers, name);
        if (raw == null) continue;
        const n = Number(raw);
        if (Number.isFinite(n)) return n;
    }
    return null;
}

function readRateLimit(headers: unknown): RateLimitSnapshot {
    return {
        remaining: readNumberHeader(headers, [
            'x-five-min-limit-remaining',
            'x-fivemincreditlimit-remaining',
        ]),
        resetsIn: readNumberHeader(headers, [
            'x-five-min-limit-resets-in',
            'x-fivemincreditlimit-resetsin',
        ]),
        requestCost: readNumberHeader(headers, ['x-request-cost']),
    };
}

function isRateLimitPayload(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false;
    const body = data as { code?: unknown; error?: unknown; message?: unknown };
    if (Number(body.code) === 429) return true;
    const text = `${body.error ?? ''} ${body.message ?? ''}`.toLowerCase();
    return text.includes('limit') || text.includes('credit') || text.includes('too many');
}

function describeAxiosError(error: unknown): Record<string, unknown> {
    if (!axios.isAxiosError(error)) {
        return { message: error instanceof Error ? error.message : String(error) };
    }
    const axiosError = error as AxiosError;
    return {
        message: axiosError.message,
        code: axiosError.code,
        status: axiosError.response?.status ?? null,
        statusText: axiosError.response?.statusText ?? null,
        data: axiosError.response?.data ?? null,
        rateLimit: readRateLimit(axiosError.response?.headers),
    };
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export class Beds24Connect {
    path: string;
    /** Во время синка ждать восстановления кредитов и повторять запрос. */
    respectRateLimits = false;

    private remaining: number | null = null;
    private resetsIn: number | null = null;
    private lastCost: number | null = null;

    constructor() {
        this.path = 'https://beds24.com/api/v2/';
    }

    rateLimitStatus(): string {
        return `remaining=${this.remaining ?? 'unknown'}, resetsIn=${this.resetsIn ?? 'unknown'}s, lastCost=${this.lastCost ?? 'unknown'}`;
    }

    async refreshToken() {
        const endpoint = 'authentication/token/';

        const config = {
            headers: {
                refreshToken: 'wkxW4KpRFjiYo/RvoNT+n9YNXT8Vbd9LJQk767UA/zjFvr9HeaC/0qc1DiAq6GI8+RlRD0DEXzOSOljnFWEZNZdZHxhQ4FEUfqadnfDxqWo4mukmiBlz92Nw979jJOSS0aSAF6/hHtyeC/5Fiz3aSHyeNT2dZflVaABENwn+FXU=',
            },
            responseType: 'json' as ResponseType,
            encoding: '',
        };

        const response = await axios.get(this.path + endpoint, config);

        if (response?.data?.token) {
            const db = await getDB();
            const collection = db.collection('beds24');
            await collection.updateOne({},
                { $set: { token: response.data.token } }
            );
        }
    }

    private rememberRateLimit(headers: unknown) {
        const snapshot = readRateLimit(headers);
        if (snapshot.remaining != null) this.remaining = snapshot.remaining;
        if (snapshot.resetsIn != null) this.resetsIn = snapshot.resetsIn;
        if (snapshot.requestCost != null) this.lastCost = snapshot.requestCost;
    }

    private async pauseForRateLimit(reason: string, resetsIn: number | null) {
        const seconds = Math.min(Math.max((resetsIn ?? this.resetsIn ?? 60) + 1, 1), MAX_RATE_LIMIT_WAIT_SEC);
        console.warn(`[Beds24] ${reason}. Waiting ${seconds}s. ${this.rateLimitStatus()}`);
        await sleep(seconds * 1000);
        this.remaining = null;
    }

    private async waitForCredits(endpoint: string) {
        const needed = Math.max(this.lastCost ?? 1, 1);
        if (this.remaining == null || this.remaining >= needed) return;
        await this.pauseForRateLimit(
            `credits remaining ${this.remaining} < ${needed} for ${endpoint}`,
            this.resetsIn,
        );
    }

    async sendGetRequest(endpoint: string, params: Record<string, unknown>, attempt = 0): Promise<any> {
        if (this.respectRateLimits) {
            await this.waitForCredits(endpoint);
        }

        const db = await getDB();
        const collection = db.collection('beds24');
        const tokenObj = await collection.findOne();
        const token = tokenObj?.token;

        const query = buildQueryString(params);
        const url = `${this.path}${endpoint}?${query}`;

        try {
            const response = await axios.get(url, {
                headers: {
                    accept: 'application/json',
                    token: token
                },
                responseType: 'json',
                timeout: REQUEST_TIMEOUT_MS
            });
            this.rememberRateLimit(response.headers);

            if (response?.data && response.data.success === false && isRateLimitPayload(response.data)) {
                if (this.respectRateLimits && attempt < MAX_RATE_LIMIT_RETRIES) {
                    console.warn('[Beds24] rate limit in response body', {
                        endpoint,
                        page: params.page ?? null,
                        attempt,
                        data: response.data,
                        rateLimit: readRateLimit(response.headers),
                    });
                    await this.pauseForRateLimit(`rate limit on ${endpoint}`, this.resetsIn);
                    return this.sendGetRequest(endpoint, params, attempt + 1);
                }
            }

            return response;
        }
        catch (error: unknown) {
            const detail = describeAxiosError(error);
            const status = axios.isAxiosError(error) ? error.response?.status : undefined;
            this.rememberRateLimit(axios.isAxiosError(error) ? error.response?.headers : undefined);

            if (status === 401 && attempt < 1) {
                console.warn('[Beds24] 401, refreshing token', { endpoint, page: params.page ?? null, ...detail });
                await this.refreshToken();
                return this.sendGetRequest(endpoint, params, attempt + 1);
            }

            const rateLimited = status === 429 || isRateLimitPayload((detail as { data?: unknown }).data);
            if (rateLimited && this.respectRateLimits && attempt < MAX_RATE_LIMIT_RETRIES) {
                console.warn('[Beds24] rate limit, will retry', {
                    endpoint,
                    page: params.page ?? null,
                    attempt,
                    ...detail,
                });
                await this.pauseForRateLimit(
                    `HTTP ${status ?? 'limit'} on ${endpoint} page ${params.page ?? '?'}`,
                    (detail.rateLimit as RateLimitSnapshot | undefined)?.resetsIn ?? null,
                );
                return this.sendGetRequest(endpoint, params, attempt + 1);
            }

            console.error('[Beds24] request failed', {
                endpoint,
                url,
                page: params.page ?? null,
                attempt,
                ...detail,
            });
            return {
                error: 'Error in Beds24 API request',
                detail: {
                    endpoint,
                    url,
                    page: params.page ?? null,
                    attempt,
                    ...detail,
                },
            };
        }
    }

    async get(endpoint: string, params: Record<string, unknown>): Promise<any> {
        const result = await this.sendGetRequest(endpoint, params);
        if (result?.error) return result;
        if (result?.data && result?.data?.success) {
            return result.data;
        }
        const detail = {
            endpoint,
            page: params.page ?? null,
            status: result?.status ?? null,
            data: result?.data ?? null,
            rateLimit: this.rateLimitStatus(),
        };
        console.error('[Beds24] unsuccessful response', detail);
        return { error: 'Error in Beds24 API request', detail };
    }

    async getTokens() {
        const result = await this.sendGetRequest('properties', { page: 1 });
        if (result?.data && result?.data?.success) {
            return {
                remaining: this.remaining ?? result?.headers['x-five-min-limit-remaining'],
                resetsIn: this.resetsIn ?? result?.headers['x-five-min-limit-resets-in'],
            }
        }
        console.error('[Beds24] token check failed', result?.detail ?? result);
        return { error: 'Error in Beds24 API request', detail: result?.detail };
    }

    async post() {
        // TODO Make post requests in Beds24
    }
}
