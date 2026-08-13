/**
 * Test stub for react-chartjs-2, wired up via `test.alias` in vite.config.ts.
 *
 * Chart.js needs a real canvas and getComputedStyle, so it cannot render in
 * jsdom. Rendering it is also not what we want to test: per docs/08-TESTING.md
 * we assert the data handed to the chart, because testing the rendered canvas
 * is testing Chart.js.
 *
 * Each stub exposes its data as JSON in a data-attribute so tests can read it.
 */

interface ChartProps {
  data: { labels?: unknown[]; datasets: { data: unknown[] }[] }
  options?: Record<string, unknown>
}

function stub(kind: string) {
  return function ChartStub({ data, options }: ChartProps) {
    return (
      <div
        data-testid={`chart-${kind}`}
        data-labels={JSON.stringify(data.labels ?? [])}
        data-values={JSON.stringify(data.datasets[0]?.data ?? [])}
        data-maintain-aspect-ratio={String(options?.maintainAspectRatio)}
      />
    )
  }
}

export const Bar = stub('bar')
export const Radar = stub('radar')
export const Line = stub('line')
export const Pie = stub('pie')
export const Doughnut = stub('doughnut')
