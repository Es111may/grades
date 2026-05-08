// Общие типы домена

export type BuildCode = 'creator' | 'visioner' | 'navigator';
export type GradeCode =
  | 'junior'
  | 'junior_plus'
  | 'premiddle'
  | 'middle'
  | 'middle_plus'
  | 'senior';
export type SkillType = 'CORE' | 'SEC';
export type AssessmentStatus = 'draft' | 'published' | 'archived';
export type UserRole = 'admin' | 'lead' | 'stardiz' | 'designer';

export const GRADE_ORDER: Record<GradeCode, number> = {
  junior: 0,
  junior_plus: 1,
  premiddle: 2,
  middle: 3,
  middle_plus: 4,
  senior: 5,
};

export const GRADE_NAMES: Record<GradeCode, string> = {
  junior: 'Джун',
  junior_plus: 'Джун+',
  premiddle: 'Пре-мидл',
  middle: 'Мидл',
  middle_plus: 'Мидл+',
  senior: 'Синьор',
};

export const BUILD_NAMES: Record<BuildCode, string> = {
  creator: 'Создатель',
  visioner: 'Визионер',
  navigator: 'Навигатор',
};
