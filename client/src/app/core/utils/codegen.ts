import type { ActiveRequest, KvEntry } from '../models/active-request.model';

function resolve(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

function buildFullUrl(req: ActiveRequest, vars: Record<string, string>): string {
  const base = resolve(req.url, vars);
  const active = req.params.filter((p) => p.enabled && p.key.trim());
  if (!active.length) return base;
  const sep = base.includes('?') ? '&' : '?';
  const qs = active
    .map(
      (p) =>
        `${encodeURIComponent(resolve(p.key, vars))}=${encodeURIComponent(resolve(p.value, vars))}`
    )
    .join('&');
  return base + sep + qs;
}

function getComputedHeaders(
  req: ActiveRequest,
  vars: Record<string, string>
): Array<[string, string]> {
  const headers: Array<[string, string]> = [];

  // Auth-derived headers
  const auth = req.auth;
  if (auth.type === 'bearer') {
    headers.push(['Authorization', `Bearer ${resolve(auth.bearer.token, vars)}`]);
  } else if (auth.type === 'basic') {
    const encoded = btoa(
      `${resolve(auth.basic.username, vars)}:${resolve(auth.basic.password, vars)}`
    );
    headers.push(['Authorization', `Basic ${encoded}`]);
  } else if (auth.type === 'apikey' && auth.apikey.in === 'header') {
    headers.push([resolve(auth.apikey.key, vars), resolve(auth.apikey.value, vars)]);
  }

  // Explicit headers (enabled, non-empty key)
  for (const h of req.headers) {
    if (h.enabled && h.key.trim()) {
      headers.push([resolve(h.key, vars), resolve(h.value, vars)]);
    }
  }

  return headers;
}

function getBodyContent(req: ActiveRequest, vars: Record<string, string>): string | null {
  if (req.body.mode === 'none') return null;
  return resolve(req.body.content, vars);
}

// ─── cURL ───────────────────────────────────────────────────────────────────

export function generateCurl(req: ActiveRequest, vars: Record<string, string> = {}): string {
  const url = buildFullUrl(req, vars);
  const headers = getComputedHeaders(req, vars);
  const body = getBodyContent(req, vars);

  const lines: string[] = [];
  lines.push(`curl --request ${req.method} \\`);
  lines.push(`  --url '${url}' \\`);

  for (const [key, value] of headers) {
    lines.push(`  --header '${key}: ${value}' \\`);
  }

  if (body !== null) {
    // Escape single quotes inside the body
    const escaped = body.replace(/'/g, "'\\''");
    lines.push(`  --data '${escaped}'`);
  } else {
    // Remove trailing backslash from last line
    const last = lines[lines.length - 1];
    if (last.endsWith(' \\')) {
      lines[lines.length - 1] = last.slice(0, -2);
    }
  }

  return lines.join('\n');
}

// ─── fetch ──────────────────────────────────────────────────────────────────

export function generateFetch(req: ActiveRequest, vars: Record<string, string> = {}): string {
  const url = buildFullUrl(req, vars);
  const headers = getComputedHeaders(req, vars);
  const body = getBodyContent(req, vars);
  const isGet = req.method === 'GET';

  const optionParts: string[] = [];

  if (!isGet) {
    optionParts.push(`  method: '${req.method}',`);
  }

  if (headers.length > 0) {
    const headerLines = headers.map(([k, v]) => `    '${k}': '${v}',`).join('\n');
    optionParts.push(`  headers: {\n${headerLines}\n  },`);
  }

  if (body !== null) {
    if (req.body.mode === 'json') {
      optionParts.push(`  body: JSON.stringify(${body}),`);
    } else {
      optionParts.push(`  body: \`${body}\`,`);
    }
  }

  let fetchCall: string;
  if (optionParts.length > 0) {
    fetchCall = `const response = await fetch('${url}', {\n${optionParts.join('\n')}\n});`;
  } else {
    fetchCall = `const response = await fetch('${url}');`;
  }

  const lines = [
    fetchCall,
    '',
    'const data = await response.json();',
  ];

  return lines.join('\n');
}

// ─── Python ─────────────────────────────────────────────────────────────────

export function generatePython(req: ActiveRequest, vars: Record<string, string> = {}): string {
  const url = buildFullUrl(req, vars);
  const headers = getComputedHeaders(req, vars);
  const body = getBodyContent(req, vars);
  const activeParams = req.params.filter((p) => p.enabled && p.key.trim());

  const methodName = req.method.toLowerCase();
  // Map HEAD/OPTIONS to generic request
  const funcName = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'].includes(methodName)
    ? methodName
    : 'request';

  const args: string[] = [`    '${url}',`];

  if (activeParams.length > 0) {
    const paramLines = activeParams
      .map(
        (p) =>
          `        '${resolve(p.key, vars)}': '${resolve(p.value, vars)}',`
      )
      .join('\n');
    args.push(`    params={\n${paramLines}\n    },`);
  }

  if (headers.length > 0) {
    const headerLines = headers.map(([k, v]) => `        '${k}': '${v}',`).join('\n');
    args.push(`    headers={\n${headerLines}\n    },`);
  }

  if (body !== null) {
    if (req.body.mode === 'json') {
      args.push(`    json=${body},`);
    } else {
      args.push(`    data='${body.replace(/'/g, "\\'")}',`);
    }
  }

  const callLines = [
    'import requests',
    '',
    `response = requests.${funcName}(`,
    ...args,
    ')',
    '',
    'print(response.status_code)',
    'print(response.json())',
  ];

  return callLines.join('\n');
}

// ─── C# ─────────────────────────────────────────────────────────────────────

export function generateCSharp(req: ActiveRequest, vars: Record<string, string> = {}): string {
  const url = buildFullUrl(req, vars);
  const headers = getComputedHeaders(req, vars);
  const body = getBodyContent(req, vars);

  const lines: string[] = [];
  lines.push('using var client = new HttpClient();');
  lines.push('');

  for (const [key, value] of headers) {
    lines.push(`client.DefaultRequestHeaders.Add("${key}", "${value}");`);
  }

  if (headers.length > 0) {
    lines.push('');
  }

  const method = req.method.toUpperCase();

  if (body !== null) {
    const contentType =
      req.body.mode === 'json' ? 'application/json' : 'text/plain';
    const escapedBody = body.replace(/"/g, '\\"');
    lines.push(
      `var content = new StringContent("${escapedBody}", System.Text.Encoding.UTF8, "${contentType}");`
    );

    if (method === 'POST') {
      lines.push(`var response = await client.PostAsync("${url}", content);`);
    } else if (method === 'PUT') {
      lines.push(`var response = await client.PutAsync("${url}", content);`);
    } else if (method === 'PATCH') {
      lines.push(`var request = new HttpRequestMessage(HttpMethod.Patch, "${url}") { Content = content };`);
      lines.push('var response = await client.SendAsync(request);');
    } else {
      lines.push(
        `var request = new HttpRequestMessage(new HttpMethod("${method}"), "${url}") { Content = content };`
      );
      lines.push('var response = await client.SendAsync(request);');
    }
  } else {
    if (method === 'GET') {
      lines.push(`var response = await client.GetAsync("${url}");`);
    } else if (method === 'DELETE') {
      lines.push(`var response = await client.DeleteAsync("${url}");`);
    } else {
      lines.push(
        `var request = new HttpRequestMessage(new HttpMethod("${method}"), "${url}");`
      );
      lines.push('var response = await client.SendAsync(request);');
    }
  }

  lines.push('');
  lines.push('var result = await response.Content.ReadAsStringAsync();');
  lines.push('Console.WriteLine(result);');

  return lines.join('\n');
}
