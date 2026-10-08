/* Local sample responses only. No data leaves the browser. */
window.chat = CypherXChat.mount('#chat', {
  title: 'CypherX Assistant',
  height: 'calc(100dvh - 57px)',
  placeholder: 'Ask about your sales',
  initialMessages: [{ id: 'welcome', role: 'assistant', timestamp: new Date(), content: 'What would you like to check today?' }],
  onSend: async function* (message, sessionId, metadata, signal) {
    const response = 'Here is the sample sales summary.\n\n| Product | Units | Revenue |\n| --- | --- | --- |\n| Notebook | 120 | 1,800 |\n| Pen | 240 | 480 |\n| Folder | 80 | 320 |\n\n';
    for (const token of response.match(/.{1,18}/gs)) {
      if (signal.aborted) return;
      yield { type: 'token', text: token };
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    yield { type: 'ui_block', spec: {
      version: '1', surface_id: 'sales-demo', title: 'Sales by product',
      blocks: [{ type: 'chart', chart_type: 'bar', x: { key: 'product', label: 'Product' },
        series: [{ key: 'revenue', label: 'Revenue' }], data: [
          { product: 'Notebook', revenue: 1800 }, { product: 'Pen', revenue: 480 }, { product: 'Folder', revenue: 320 }
        ] }]
    } };
    yield { type: 'followups', followups: { label: 'Explore further', options: ['Show products', 'Summarize revenue'], multi: false } };
    yield { type: 'done', sessionId: sessionId || 'demo-session', messageId: 'demo-' + Date.now() };
  }
});
