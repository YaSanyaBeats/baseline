import axios from 'axios';
import { CommonResponse, User } from './types';

export async function getUsers(): Promise<User[]>{
    if(!process.env.NEXT_PUBLIC_API_URL) {
        throw new Error('Нет NEXT_PUBLIC_API_URL в переменных окружения');
    }

    const response = await axios.get(process.env.NEXT_PUBLIC_API_URL + 'users');
    console.log(response.data);
    return response.data;
}

export async function getUser(id: string): Promise<User>{
    if(!process.env.NEXT_PUBLIC_API_URL) {
        throw new Error('Нет NEXT_PUBLIC_API_URL в переменных окружения');
    }

    const response = await axios.get(process.env.NEXT_PUBLIC_API_URL + 'users', {
        params: {
            id: id
        }
    });

    return response.data;
}

export async function sendNewUser(user: User): Promise<CommonResponse>{
    if(!process.env.NEXT_PUBLIC_API_URL) {
        throw new Error('Нет NEXT_PUBLIC_API_URL в переменных окружения');
    }

    const response = await axios.post(process.env.NEXT_PUBLIC_API_URL + 'users/addUser', {
        params: {
            user: user
        }
    });
    return response.data;

}

export async function sendEditUser(user: User): Promise<CommonResponse>{
    if(!process.env.NEXT_PUBLIC_API_URL) {
        throw new Error('Нет NEXT_PUBLIC_API_URL в переменных окружения');
    }

    const response = await axios.post(process.env.NEXT_PUBLIC_API_URL + 'users/editUser', {
        params: {
            user: user
        }
    });
    return response.data;

}

export async function sendDeleteUser(id: string): Promise<CommonResponse>{
    if(!process.env.NEXT_PUBLIC_API_URL) {
        throw new Error('Нет NEXT_PUBLIC_API_URL в переменных окружения');
    }

    const response = await axios.delete(process.env.NEXT_PUBLIC_API_URL + 'users/deleteUser', {
        params: {
            id: id
        }
    });
    return response.data;

}