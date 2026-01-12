import axios from 'axios';
import { CommonResponse, User } from './types';
import { getApiUrl } from './api-client';

export async function getUsers(): Promise<User[]>{
    const response = await axios.get(getApiUrl('users'));
    console.log(response.data);
    return response.data;
}

export async function getUser(id: string): Promise<User>{
    const response = await axios.get(getApiUrl('users'), {
        params: {
            id: id
        }
    });

    return response.data;
}

export async function sendNewUser(user: User): Promise<CommonResponse>{
    const response = await axios.post(getApiUrl('users/addUser'), {
        params: {
            user: user
        }
    });
    return response.data;

}

export async function sendEditUser(user: User): Promise<CommonResponse>{
    const response = await axios.post(getApiUrl('users/editUser'), {
        params: {
            user: user
        }
    });
    return response.data;

}

export async function sendDeleteUser(id: string): Promise<CommonResponse>{
    const response = await axios.delete(getApiUrl('users/deleteUser'), {
        params: {
            id: id
        }
    });
    return response.data;

}