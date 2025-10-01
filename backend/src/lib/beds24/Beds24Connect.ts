import axios, { ResponseType } from 'axios';
import db from '../../db/getDB';

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
            const collection = db.collection('beds24');
            const user = await collection.updateOne({},
				{ $set: { token: response.data.token } }
            );
        }
    }

    async get(endpoint: string, params: any): Promise<any> {
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
				responseType: 'json'
			});
			return response.data;
		}
		catch(response: any) {
			if(response?.status === 401) {
				this.refreshToken();
				return this.get(endpoint, params);
			}
			return response;
		}
    }

    async post() {
		// TODO Make post requests in Beds24
    }
}

/*function sendRequestGET($url) {
	$curl = curl_init();

	curl_setopt_array($curl, array(
	  CURLOPT_URL => $url,
	  CURLOPT_RETURNTRANSFER => true,
	  CURLOPT_ENCODING => '',
	  CURLOPT_MAXREDIRS => 10,
	  CURLOPT_TIMEOUT => 0,
	  CURLOPT_FOLLOWLOCATION => true,
	  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
	  CURLOPT_CUSTOMREQUEST => 'GET',
	  CURLOPT_HTTPHEADER => array(
	    'token: ' . file_get_contents(get_theme_file_path() . '/token.txt'),
	  ),
	));

	$response = json_decode(curl_exec($curl), true);
	curl_close($curl);


	
	if(!$response['success'] && $response['code'] === 401) {
		$path = 'https://beds24.com/api/v2/';
		$endpoint = 'authentication/token/';

		if(getToken()) {
			return sendRequestGET($url);
		}
		return ['success' => false];
	}


	return $response;
}

function sendRequestPOST($url, $postFields) {
	$curl = curl_init();

	curl_setopt_array($curl, array(
	  CURLOPT_URL => $url,
	  CURLOPT_RETURNTRANSFER => true,
	  CURLOPT_ENCODING => '',
	  CURLOPT_MAXREDIRS => 10,
	  CURLOPT_TIMEOUT => 0,
	  CURLOPT_FOLLOWLOCATION => true,
	  CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
	  CURLOPT_CUSTOMREQUEST => 'POST',
	  CURLOPT_POSTFIELDS => $postFields,
	  CURLOPT_HTTPHEADER => array(
	  	'accept: application/json',
	    'token: ' . file_get_contents(get_theme_file_path() . '/token.txt'),
	    'Content-Type: application/json'
	  ),
	));

	$response = json_decode(curl_exec($curl), true);
	curl_close($curl);

	if(!empty($response[0]) && !$response[0]['success'] && $response[0]['code'] === 401) {
		$path = 'https://beds24.com/api/v2/';
		$endpoint = 'authentication/token/';

		if(getToken()) {
			return sendRequestGET($url);
		}
		return ['success' => false];
	}


	return $response;
}*/