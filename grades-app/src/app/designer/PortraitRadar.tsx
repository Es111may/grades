'use client';

/**
 * Радар портрета — профиль навыков и мини-радары групп в ховер-полосе.
 * Вынесен из Portrait отдельным модулем ради ленивой загрузки: chart.js
 * (~68 КБ gzip) больше не входит в First Load /designer и /lead/portrait.
 * Portrait подключает его через next/dynamic с ssr: false — канвас всё
 * равно рисуется только в браузере, на сервере стоит RadarSkeleton.
 *
 * Данные и опции (цвета осей по теме, шрифт подписей из
 * onest.style.fontFamily) по-прежнему собирает Portrait — здесь только
 * регистрация модулей chart.js и сам <Radar>.
 */
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import { Radar } from 'react-chartjs-2';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

export default function PortraitRadar({
  data,
  options,
}: {
  data: ChartData<'radar'>;
  options: ChartOptions<'radar'>;
}) {
  return <Radar data={data} options={options} />;
}
