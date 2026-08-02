import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend, Counter, Gauge } from 'k6/metrics';

// Configuration
const BASE_URL = __ENV.SECURITY_ENGINE_URL || 'http://localhost:8000';
const DURATION = __ENV.DURATION || '30s';
const VUS = parseInt(__ENV.VUS || '100', 10);
const RAMP_UP = parseInt(__ENV.RAMP_UP || '30', 10);

// Custom metrics
const encryptLatency = new Trend('encrypt_latency_ms');
const validateLatency = new Trend('validate_latency_ms');
const encryptErrorRate = new Rate('encrypt_errors');
const validateErrorRate = new Rate('validate_errors');
const validQRCount = new Counter('valid_qr_count');
const duplicateQRCount = new Counter('duplicate_qr_count');
const invalidQRCount = new Counter('invalid_qr_count');

export const options = {
  stages: [
    { duration: `${RAMP_UP}s`, target: VUS },     // Ramp up to target VUs
    { duration: `${DURATION}`, target: VUS },     // Stay at target
    { duration: '10s', target: 0 },               // Ramp down
  ],
  thresholds: {
    'encrypt_latency_ms': ['p(95) < 200'],   // 95th percentile under 200ms
    'validate_latency_ms': ['p(95) < 200'],  // 95th percentile under 200ms
    'encrypt_errors': ['rate < 0.1'],        // Error rate under 10%
    'validate_errors': ['rate < 0.1'],       // Error rate under 10%
    http_req_duration: ['p(95) < 300'],      // HTTP requests under 300ms (95th)
  },
};

function generateTicketId() {
  const chars = 'abcdef0123456789';
  let result = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      result += '-';
    } else {
      result += chars[Math.floor(Math.random() * chars.length)];
    }
  }
  return result;
}

function generateUserId() {
  return `user-${Math.random().toString(36).substr(2, 9)}`;
}

export default function () {
  group('Encrypt Endpoint', () => {
    const ticketId = generateTicketId();
    const userId = generateUserId();

    const payload = JSON.stringify({
      ticket_id: ticketId,
      user_id: userId,
    });

    const params = {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: '10s',
    };

    const response = http.post(`${BASE_URL}/security/api/v1/encrypt`, payload, params);

    const isSuccess = check(response, {
      'encrypt status is 200': (r) => r.status === 200,
      'encrypt has encrypted_qr': (r) => r.json('encrypted_qr') !== undefined,
      'encrypt has timestamp_ms': (r) => r.json('timestamp_ms') !== undefined,
      'encrypt success is true': (r) => r.json('success') === true,
    });

    encryptLatency.add(response.timings.duration);
    if (!isSuccess) {
      encryptErrorRate.add(1);
    } else {
      encryptErrorRate.add(0);

      // Validate the encrypted QR immediately
      group('Validate Endpoint', () => {
        const encryptedQr = response.json('encrypted_qr');

        const validatePayload = JSON.stringify({
          encrypted_qr: encryptedQr,
          ttl_seconds: 30,
        });

        const validateResponse = http.post(
          `${BASE_URL}/security/api/v1/validate`,
          validatePayload,
          params
        );

        const isValidateSuccess = check(validateResponse, {
          'validate status is 200': (r) => r.status === 200,
          'validate has valid field': (r) => r.json('valid') !== undefined,
          'validate ticket_id matches': (r) => r.json('ticket_id') === ticketId,
        });

        validateLatency.add(validateResponse.timings.duration);

        if (!isValidateSuccess) {
          validateErrorRate.add(1);
        } else {
          validateErrorRate.add(0);

          // Count validation results
          const validField = validateResponse.json('valid');
          const reason = validateResponse.json('reason');
          if (validField === true) {
            validQRCount.add(1);
          } else if (reason && reason.includes('Duplicate')) {
            duplicateQRCount.add(1);
          } else {
            invalidQRCount.add(1);
          }
        }
      });
    }
  });

  sleep(1);
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    '/tmp/summary.json': JSON.stringify(data),
  };
}

function textSummary(data, options) {
  const { indent = '', enableColors = false } = options;
  const bold = enableColors ? '\x1b[1m' : '';
  const reset = enableColors ? '\x1b[0m' : '';
  const green = enableColors ? '\x1b[32m' : '';
  const red = enableColors ? '\x1b[31m' : '';

  let summary = `\n${bold}Load Test Summary${reset}\n`;
  summary += `${bold}=================${reset}\n\n`;

  // Metrics summary
  const metrics = data.metrics || {};
  summary += `${bold}Response Times:${reset}\n`;
  if (metrics.encrypt_latency_ms) {
    const trend = metrics.encrypt_latency_ms.values;
    summary += `${indent}/encrypt: avg=${trend['avg']?.toFixed(2) || 'N/A'}ms, p95=${trend['p(95)']?.toFixed(2) || 'N/A'}ms, max=${trend['max']?.toFixed(2) || 'N/A'}ms\n`;
  }
  if (metrics.validate_latency_ms) {
    const trend = metrics.validate_latency_ms.values;
    summary += `${indent}/validate: avg=${trend['avg']?.toFixed(2) || 'N/A'}ms, p95=${trend['p(95)']?.toFixed(2) || 'N/A'}ms, max=${trend['max']?.toFixed(2) || 'N/A'}ms\n`;
  }

  summary += `\n${bold}Error Rates:${reset}\n`;
  if (metrics.encrypt_errors) {
    const rate = metrics.encrypt_errors.values['rate'] || 0;
    const status = rate < 0.1 ? green : red;
    summary += `${indent}/encrypt: ${status}${(rate * 100).toFixed(2)}%${reset}\n`;
  }
  if (metrics.validate_errors) {
    const rate = metrics.validate_errors.values['rate'] || 0;
    const status = rate < 0.1 ? green : red;
    summary += `${indent}/validate: ${status}${(rate * 100).toFixed(2)}%${reset}\n`;
  }

  summary += `\n${bold}Validation Results:${reset}\n`;
  if (metrics.valid_qr_count) {
    summary += `${indent}Valid QRs: ${metrics.valid_qr_count.values['count'] || 0}\n`;
  }
  if (metrics.duplicate_qr_count) {
    summary += `${indent}Duplicate QRs: ${metrics.duplicate_qr_count.values['count'] || 0}\n`;
  }
  if (metrics.invalid_qr_count) {
    summary += `${indent}Invalid QRs: ${metrics.invalid_qr_count.values['count'] || 0}\n`;
  }

  summary += '\n';
  return summary;
}
