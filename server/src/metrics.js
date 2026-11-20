// Простий збір метрик продуктивності в пам'яті процесу (лабораторна №5).
const durations = [];
const MAX_SAMPLES = 200;
let requestsTotal = 0;
let httpErrorsTotal = 0;
const startedAt = Date.now();

export function metricsMiddleware(req, res, next) {
  const begin = performance.now();
  res.on('finish', () => {
    if (req.path === '/api/metrics') return;
    const ms = Math.round((performance.now() - begin) * 100) / 100;
    durations.push(ms);
    if (durations.length > MAX_SAMPLES) durations.shift();
    requestsTotal += 1;
    if (res.statusCode >= 400) httpErrorsTotal += 1;
  });
  next();
}

export function getMetrics() {
  const sorted = [...durations].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const round = (x) => Math.round(x * 100) / 100;
  return {
    service: 'autopulse',
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    requestsTotal,
    httpErrorsTotal,
    errorRatePercent: requestsTotal ? round((httpErrorsTotal / requestsTotal) * 100) : 0,
    recentRequests: sorted.length,
    averageLatencyMs: sorted.length ? round(sum / sorted.length) : 0,
    p95LatencyMs: sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1] : 0,
    memoryRssMb: Math.round(process.memoryUsage().rss / 1048576)
  };
}
