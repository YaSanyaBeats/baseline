/** Next.js RSC → Client: нельзя передавать BSON ObjectId и др. с toJSON. */

export function userWithPlainId<T extends Record<string, unknown>>(user: T | null | undefined): T | null {
    if (user == null || typeof user !== 'object') {
        return null;
    }
    const copy = { ...user } as Record<string, unknown>;
    const id = copy._id;
    if (id != null && typeof id !== 'string') {
        copy._id =
            typeof id === 'object' && id !== null && typeof (id as { toString?: () => string }).toString === 'function'
                ? (id as { toString: () => string }).toString()
                : String(id);
    }
    return copy as T;
}
