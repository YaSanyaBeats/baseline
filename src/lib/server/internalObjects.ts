import { getDB } from "../db/getDB";

/**
 * Диапазон ID для внутренних объектов: отрицательные числа
 * -1: Объект "HolyCowPhuket внутренний объект"
 * -2, -3, -4, ...: Филиалы компании (комнаты)
 * 
 * Этот диапазон не пересекается с Beds24, где ID всегда положительные.
 */

export const COMPANY_OBJECT_ID = -1;

export interface InternalObjectRoom {
    id: number;
    name: string;
}

export interface InternalObject {
    id: number;
    name: string;
    roomTypes: {
        units: InternalObjectRoom[];
    }[];
    type?: 'company'; // Метка для идентификации типа внутреннего объекта
}

/**
 * Инициализирует объект "HolyCowPhuket внутренний объект" и филиалы в коллекции internalObjects.
 * Проверяет наличие объекта по id, чтобы избежать дублирования.
 */
export async function initializeInternalObjects() {
    const db = await getDB();
    const collection = db.collection('internalObjects');

    // Проверяем, существует ли уже объект "HolyCowPhuket внутренний объект"
    const existingCompany = await collection.findOne({ id: COMPANY_OBJECT_ID });

    if (existingCompany) {
        console.log('Объект "HolyCowPhuket внутренний объект" уже существует, инициализация не требуется');
        return { success: true, message: 'Объект "HolyCowPhuket внутренний объект" уже существует' };
    }

    // Создаём объект "HolyCowPhuket внутренний объект" с одним филиалом по умолчанию
    const companyObject: InternalObject = {
        id: COMPANY_OBJECT_ID,
        name: process.env.COMPANY_NAME || 'HolyCowPhuket внутренний объект',
        type: 'company',
        roomTypes: [
            {
                units: [
                    {
                        id: -2, // Первый филиал
                        name: 'Главный офис'
                    }
                ]
            }
        ]
    };

    await collection.insertOne(companyObject);
    console.log('Объект "HolyCowPhuket внутренний объект" успешно создан');

    return { 
        success: true, 
        message: 'Объект "HolyCowPhuket внутренний объект" успешно инициализирован'
    };
}

/**
 * Получает все внутренние объекты из коллекции internalObjects
 */
export async function getInternalObjects() {
    const db = await getDB();
    const collection = db.collection('internalObjects');
    const objects = await collection.find({}).sort({ name: 1 }).toArray();
    return objects;
}

/**
 * Добавляет новый филиал к объекту "HolyCowPhuket внутренний объект"
 */
export async function addCompanyBranch(branchName: string) {
    const db = await getDB();
    const collection = db.collection('internalObjects');

    const company = await collection.findOne({ id: COMPANY_OBJECT_ID });
    
    if (!company) {
        throw new Error('Объект "HolyCowPhuket внутренний объект" не найден. Выполните инициализацию.');
    }

    // Находим минимальный ID среди существующих филиалов
    const existingBranches = company.roomTypes?.[0]?.units || [];
    const minId = existingBranches.length > 0 
        ? Math.min(...existingBranches.map((branch: any) => branch.id))
        : -1;
    
    const newBranchId = minId - 1; // Следующий отрицательный ID

    const newBranch = {
        id: newBranchId,
        name: branchName
    };

    await collection.updateOne(
        { id: COMPANY_OBJECT_ID },
        {
            $push: {
                'roomTypes.0.units': newBranch
            } as any
        }
    );

    return { 
        success: true, 
        message: 'Филиал успешно добавлен',
        branchId: newBranchId
    };
}

/**
 * Удаляет филиал из объекта "HolyCowPhuket внутренний объект"
 */
export async function removeCompanyBranch(branchId: number) {
    const db = await getDB();
    const collection = db.collection('internalObjects');

    await collection.updateOne(
        { id: COMPANY_OBJECT_ID },
        {
            $pull: {
                'roomTypes.0.units': { id: branchId }
            } as any
        }
    );

    return { 
        success: true, 
        message: 'Филиал успешно удалён'
    };
}

/**
 * Переименовывает филиал объекта "HolyCowPhuket внутренний объект"
 */
export async function renameCompanyBranch(branchId: number, newName: string) {
    const db = await getDB();
    const collection = db.collection('internalObjects');

    await collection.updateOne(
        { 
            id: COMPANY_OBJECT_ID,
            'roomTypes.0.units.id': branchId
        },
        {
            $set: {
                'roomTypes.0.units.$.name': newName
            }
        }
    );

    return { 
        success: true, 
        message: 'Филиал успешно переименован'
    };
}
