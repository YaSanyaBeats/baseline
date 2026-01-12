import axios, { ResponseType } from 'axios';
import { getDB } from '../db/getDB';

function buildQueryString(params: any) {
    const queryParts = [];

    for (const key in params) {
		if (key === 'id') {
			params.id.forEach((id: number) => {
				queryParts.push(`id=${encodeURIComponent(id)}`);
			});
		}
		else {
			queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`);
		}
    }

    return queryParts.join('&');
}

export class Beds24Connect {
    path: string;

    constructor() {
        this.path = 'https://beds24.com/api/v2/';
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

        if(response?.data?.token) {
            const db = await getDB();
            const collection = db.collection('beds24');
            const user = await collection.updateOne({},
				{ $set: { token: response.data.token } }
            );
        }
    }

    async sendGetRequest(endpoint: string, params: any): Promise<any> {
        const db = await getDB();
        const collection = db.collection('beds24');
        const tokenObj = await collection.findOne();
        const token = tokenObj?.token;

		params = buildQueryString(params);
        let url = `${this.path}${endpoint}?${params}`;
		
		try {
			const response = await axios.get(url, {
				headers: {
					accept: 'application/json',
					token: token
				},
				responseType: 'json',
				timeout: 5000
			});
			return response;
		}
		catch(response: any) {
			if(response?.status === 401) {
				this.refreshToken();
				return this.sendGetRequest(endpoint, params);
			}
			return {'error': 'Error in Beds24 API request'};
		}
    }

	async get(endpoint: string, params: any): Promise<any> {
		let result = await this.sendGetRequest(endpoint, params);
		if(result?.data && result?.data?.success) {
			return result.data;
		}
		return {'error': 'Error in Beds24 API request'};
	}

	async getTokens() {
		let result = await this.sendGetRequest('properties', { page: 1 });
		if(result?.data && result?.data?.success) {
			return {
				remaining: result?.headers['x-five-min-limit-remaining'],
				resetsIn: result?.headers['x-five-min-limit-resets-in'],
			}
		}
		return {'error': 'Error in Beds24 API request'};
	}

    async post() {
		// TODO Make post requests in Beds24
    }
}

