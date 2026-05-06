// Общие типы домена

export type BuildCode = 'creator' | 'visioner' | 'navigator';
export type GradeCode =
  | 'intern'
  | 'junior'
  | 'junior_plus'
  | 'middle'
  | 'middle_plus'
  | 'senior';
export type SkillType = 'CORE' | 'SEC';
export type AssessmentStatus = 'draft' | 'published' | 'archived';
export type UserRole = 'admin' | 'lead' | 'designer';

export const GRADE_ORDER: Record<GradeCode, number> = {
  intern: 0,
  junior: 1,
  junior_plus: 2,
  middle: 3,
  middle_plus: 4,
  senior: 5,
};

export const GRADE_NAMES: Record<GradeCode, string> = {
  intern: 'Intern',
  junior: 'Джун',
  junior_plus: 'Джун+',
  middle: 'Мидл',
  middle_plus: 'Мидл+',
  senior: 'Синьор',
};

export const BUILD_NAMES: Record<BuildCode, string> = {
  creator: 'Создатель',
  visioner: 'Визионер',
  navigator: 'Навигатор',
};
