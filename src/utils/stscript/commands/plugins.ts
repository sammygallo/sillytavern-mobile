// Plugin proxy command: /plugin
// Calls a server extension's HTTP API endpoint from within STscript.

import { registerCommand } from '../registry';
import { apiRequest } from '../../../api/client';

registerCommand({
  name: 'plugin',
  description: 'Call a server extension API endpoint',
  category: 'system',
  usage: '/plugin name=<extensionName> endpoint=<path> [method=GET|POST] [body=<json>]',
  async handler(args, _rawArgs, ctx) {
    const extName = args.find((a) => a.key === 'name')?.value;
    const endpoint = args.find((a) => a.key === 'endpoint')?.value;
    const method = (args.find((a) => a.key === 'method')?.value ?? 'POST').toUpperCase();
    const body = args.find((a) => a.key === 'body')?.value;

    if (!extName) {
      ctx.showToast('/plugin requires name=<extensionName>', 'error');
      return '';
    }
    if (!endpoint) {
      ctx.showToast('/plugin requires endpoint=<path>', 'error');
      return '';
    }

    const path = endpoint.replace(/^\//, '');
    const url = `/api/plugins/${encodeURIComponent(extName)}/${path}`;

    try {
      const options: RequestInit = { method };
      if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        options.body = body;
      }
      const result = await apiRequest<unknown>(url, options);
      return typeof result === 'string' ? result : JSON.stringify(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.showToast(`/plugin error: ${msg}`, 'error');
      return '';
    }
  },
});
