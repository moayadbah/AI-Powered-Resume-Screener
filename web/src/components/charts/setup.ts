/** Register only the Chart.js pieces we use, so the bundle stays small. */

import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  RadialLinearScale,
  Tooltip,
} from 'chart.js'

Chart.register(
  CategoryScale,
  LinearScale,
  RadialLinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
)

/**
 * Chart.js grows without bound inside a flex parent unless this is off and the
 * container has a fixed height.
 */
export const BASE_OPTIONS = {
  responsive: true,
  maintainAspectRatio: false,
} as const
