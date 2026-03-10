export interface ParsedCurlRequest {
  method: string;
  url: string;
  headers: Array<{ key: string; value: string; enabled: boolean }>;
  params: Array<{ key: string; value: string; enabled: boolean }>;
  body: { mode: string; content: string };
  auth: {
    type: 'none' | 'bearer' | 'basic' | 'apikey';
    bearer?: { token: string };
    basic?: { username: string; password: string };
    apikey?: { key: string; value: string; in: 'header' | 'query' };
  };
}

/**
 * Tokenize a cURL command string, respecting single and double quotes.
 * Strips surrounding quote characters from tokens.
 */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      i++;
      continue;
    }

    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      i++;
      continue;
    }

    if (!inSingle && !inDouble && (ch === ' ' || ch === '\t')) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Parse a cURL command string into a structured request object.
 */
export function parseCurl(input: string): ParsedCurlRequest {
  // 1. Handle line continuations: backslash + newline
  const joined = input.replace(/\\\r?\n/g, ' ');

  // 2. Tokenize respecting quotes
  const tokens = tokenize(joined);

  // Skip the leading "curl" token
  let i = 0;
  if (tokens[i]?.toLowerCase() === 'curl') {
    i++;
  }

  const IGNORE_FLAGS = new Set([
    '-k', '--insecure', '--compressed', '-s', '--silent',
    '-L', '--location', '-v', '--verbose', '-i', '--include',
    '-I', '--head', '-f', '--fail', '-S', '--show-error',
    '--no-keepalive',
  ]);

  let method: string | null = null;
  let url: string | null = null;
  const rawHeaders: Array<{ key: string; value: string }> = [];
  let bodyContent = '';
  let userCredentials: string | null = null;
  let cookieValue: string | null = null;

  while (i < tokens.length) {
    const token = tokens[i];

    // Ignore flags
    if (IGNORE_FLAGS.has(token)) {
      i++;
      continue;
    }

    // -X POST or --request POST
    if (token === '-X' || token === '--request') {
      method = tokens[++i] ?? null;
      i++;
      continue;
    }

    // -XPOST (concatenated)
    if (/^-X.+/.test(token)) {
      method = token.slice(2);
      i++;
      continue;
    }

    // -H or --header
    if (token === '-H' || token === '--header') {
      const headerStr = tokens[++i] ?? '';
      const colonIdx = headerStr.indexOf(':');
      if (colonIdx !== -1) {
        const key = headerStr.slice(0, colonIdx).trim();
        const value = headerStr.slice(colonIdx + 1).trim();
        rawHeaders.push({ key, value });
      }
      i++;
      continue;
    }

    // -d, --data, --data-raw, --data-binary
    if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary') {
      bodyContent = tokens[++i] ?? '';
      i++;
      continue;
    }

    // -u or --user
    if (token === '-u' || token === '--user') {
      userCredentials = tokens[++i] ?? '';
      i++;
      continue;
    }

    // --url
    if (token === '--url') {
      url = tokens[++i] ?? null;
      i++;
      continue;
    }

    // -b or --cookie
    if (token === '-b' || token === '--cookie') {
      cookieValue = tokens[++i] ?? '';
      i++;
      continue;
    }

    // Positional: bare URL (first non-flag arg)
    if (!token.startsWith('-') && url === null) {
      url = token;
      i++;
      continue;
    }

    i++;
  }

  if (!url) {
    throw new Error('Could not extract URL from cURL command');
  }

  // Default method
  if (!method) {
    method = bodyContent ? 'POST' : 'GET';
  }

  // 4. Extract query params from URL
  const params: Array<{ key: string; value: string; enabled: boolean }> = [];
  let cleanUrl = url;
  try {
    const parsed = new URL(url);
    parsed.searchParams.forEach((value, key) => {
      params.push({ key, value, enabled: true });
    });
    parsed.search = '';
    cleanUrl = parsed.toString();
    // Remove trailing ? if empty
    if (cleanUrl.endsWith('?')) {
      cleanUrl = cleanUrl.slice(0, -1);
    }
  } catch {
    // URL may be partial; just keep it as-is
    cleanUrl = url;
  }

  // 5. Add cookie header if present
  if (cookieValue) {
    rawHeaders.push({ key: 'Cookie', value: cookieValue });
  }

  // 6. Detect auth: Bearer from Authorization header
  let authType: ParsedCurlRequest['auth']['type'] = 'none';
  let bearerToken: string | undefined;
  let basicCreds: { username: string; password: string } | undefined;
  const finalHeaders: Array<{ key: string; value: string; enabled: boolean }> = [];

  for (const h of rawHeaders) {
    if (h.key.toLowerCase() === 'authorization') {
      const val = h.value;
      if (val.startsWith('Bearer ')) {
        authType = 'bearer';
        bearerToken = val.slice(7);
        // Don't add to finalHeaders — absorbed into auth
        continue;
      } else if (val.startsWith('Basic ')) {
        authType = 'basic';
        const decoded = Buffer.from(val.slice(6), 'base64').toString('utf-8');
        const colonIdx = decoded.indexOf(':');
        basicCreds = {
          username: colonIdx !== -1 ? decoded.slice(0, colonIdx) : decoded,
          password: colonIdx !== -1 ? decoded.slice(colonIdx + 1) : '',
        };
        // Don't add to finalHeaders — absorbed into auth
        continue;
      }
    }
    finalHeaders.push({ key: h.key, value: h.value, enabled: true });
  }

  // 7. Detect Basic auth from -u user:pass
  if (userCredentials && authType === 'none') {
    authType = 'basic';
    const colonIdx = userCredentials.indexOf(':');
    basicCreds = {
      username: colonIdx !== -1 ? userCredentials.slice(0, colonIdx) : userCredentials,
      password: colonIdx !== -1 ? userCredentials.slice(colonIdx + 1) : '',
    };
  }

  // 8. Detect body mode
  let bodyMode = 'raw';
  if (bodyContent) {
    const trimmed = bodyContent.trim();
    const contentTypeHeader = rawHeaders.find((h) => h.key.toLowerCase() === 'content-type');
    const isJson =
      contentTypeHeader?.value.includes('application/json') ||
      trimmed.startsWith('{') ||
      trimmed.startsWith('[');
    bodyMode = isJson ? 'json' : 'raw';
  }

  // Build result
  const auth: ParsedCurlRequest['auth'] = { type: authType };
  if (authType === 'bearer') {
    auth.bearer = { token: bearerToken ?? '' };
  } else if (authType === 'basic') {
    auth.basic = basicCreds ?? { username: '', password: '' };
  }

  return {
    method: method.toUpperCase(),
    url: cleanUrl,
    headers: finalHeaders,
    params,
    body: {
      mode: bodyContent ? bodyMode : 'none',
      content: bodyContent,
    },
    auth,
  };
}
