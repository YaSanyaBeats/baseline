import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
    interface Session {
        impersonatedBy?: {
            _id?: string;
            login: string;
            name: string;
            role: string;
        };
    }
}

declare module 'next-auth/jwt' {
    interface JWT {
        impersonatedBy?: {
            _id?: string;
            login: string;
            name: string;
            role: string;
        };
    }
}
