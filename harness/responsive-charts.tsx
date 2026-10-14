import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AuiView, ChatContainer, ChatProvider, type ChartBlock, type ChartType, type ViewSpec } from '@cypherx/chat-ui'
import '@cypherx/chat-ui/styles.css'

const params = new URLSearchParams(window.location.search)
const width = Number(params.get('width')) || 390
const longLabels = params.has('long-labels')
const chartType = (params.get('type') || 'bar_grouped') as ChartType
const block: ChartBlock = {
  type: 'chart',
  chart_type: chartType,
  title: longLabels ? 'Daily sales breakdown for all locations and payment channels' : 'Daily sales breakdown',
  x: { key: 'day', label: 'Date' },
  series: longLabels
    ? Array.from({ length: 6 }, (_, i) => ({ key: `value${i}`, label: `Channel ${i + 1} ${'LongReference'.repeat(5)}` }))
    : [{ key: 'bills', label: 'Bills' }, { key: 'amount', label: 'Sales amount' }],
  data: Array.from({ length: longLabels ? 8 : 2 }, (_, i) => ({
    day: chartType === 'scatter' ? i + 1 : longLabels && ['pie', 'donut', 'bar_horizontal'].includes(chartType)
      ? `Location ${i + 1} ${'LongReference'.repeat(5)}` : `2026-10-${String(i + 6).padStart(2, '0')}`,
    bills: i === 0 ? 1 : 6,
    amount: i === 0 ? 32 : 1989,
    ...Object.fromEntries(Array.from({ length: 6 }, (_, j) => [`value${j}`, (i + 1) * (j + 1) * 100])),
  })),
  options: { show_legend: !params.has('no-legend') },
}
const spec: ViewSpec = { surface_id: 'daily-sales', version: '1', blocks: [block] }
const noSend = async function* () {}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main data-ready style={{ padding: 8, fontFamily: 'var(--cxc-font-sans)' }}>
      <div data-host style={{ width, maxWidth: '100%', minWidth: 0, height: params.has('standalone') ? undefined : 780 }}>
        {params.has('standalone') ? <AuiView spec={spec} onSendMessage={() => {}} /> : (
          <ChatProvider onSend={noSend} autoFocus={false} initialMessages={[
            { id: 'sales', role: 'assistant', content: '', blocks: [spec], timestamp: new Date(0) },
          ]}>
            <ChatContainer showSessions={params.has('sessions')} />
          </ChatProvider>
        )}
      </div>
    </main>
  </StrictMode>,
)
