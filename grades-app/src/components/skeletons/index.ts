// Каркасы загрузки — один модуль: кирпичики (Bone, Line, CardBone) и
// каркасы страниц и лениво загружаемых кусков. Тон — bg-cloud + animate-pulse.
//
// Серверные loading.tsx берут отсюда. Клиентские компоненты — из файла
// раздела (./portrait, ./team, ./economics): каркас попадает в First Load
// страницы, и лишнего из соседних разделов туда тянуть не нужно.

export { Bone, Line, CardBone } from './Bone';
export {
  default as PageSkeleton,
  HeaderSkeleton,
  ToolbarSkeleton,
  CardListSkeleton,
  GridCardsSkeleton,
  PortraitPageSkeleton,
  AssessPageSkeleton,
  GradesPageSkeleton,
} from './pages';
export { RadarSkeleton, PerformanceSkeleton, ChecklistsSkeleton, SalaryCardSkeleton } from './portrait';
export { KanbanSkeleton, MatrixGridSkeleton, MatrixSkeleton } from './team';
export { MonthlySkeleton, EconomicsPageSkeleton } from './economics';
