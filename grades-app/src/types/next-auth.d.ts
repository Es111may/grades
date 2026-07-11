// Расширяем типы next-auth, чтобы session содержала наши доменные поля
// (role, buildId, leadId, gradeFloor).

import type { DefaultSession } from 'next-auth';
import type { UserRole, BuildCode, GradeCode } from '@/lib/types';

declare module 'next-auth' {
  interface Session {
    user: {
      id: number;
      role: UserRole;
      buildId: number | null;
      buildCode: BuildCode | null;
      leadId: number | null;
      gradeFloor: GradeCode | null;
      department: string | null;
      /** id админа, вошедшего «под» этим пользователем (имперсонация). */
      impersonatorId: number | null;
    } & DefaultSession['user'];
  }

  interface User {
    id: string; // NextAuth requires string id; мы дополнительно храним numericId
    numericId: number;
    role: UserRole;
    buildId: number | null;
    buildCode: BuildCode | null;
    leadId: number | null;
    gradeFloor: GradeCode | null;
    department: string | null;
    impersonatorId?: number | null;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    numericId: number;
    role: UserRole;
    buildId: number | null;
    buildCode: BuildCode | null;
    leadId: number | null;
    gradeFloor: GradeCode | null;
    department: string | null;
    impersonatorId?: number | null;
  }
}
