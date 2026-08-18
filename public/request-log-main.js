(() => {
  if (typeof Window === 'undefined' || !(globalThis instanceof Window)) {
    return;
  }
  if (globalThis.__modheaderLogHookInstalled) {
    return;
  }
  globalThis.__modheaderLogHookInstalled = true;

  const resolveUrl = (raw) => {
    try {
      return new URL(raw, location.href).href;
    } catch {
      return String(raw ?? '');
    }
  };

  const post = (payload) => {
    try {
      globalThis.postMessage(
        {
          type: 'modheader:request-log-body',
          method: String(payload.method || 'GET').toUpperCase(),
          url: resolveUrl(payload.url),
          startedAt: payload.startedAt,
          requestBody: payload.requestBody,
          requestBodyKind: payload.requestBodyKind,
          responseBody: payload.responseBody,
          responseBodyKind: payload.responseBodyKind,
        },
        '*',
      );
    } catch {
      /* ignore */
    }
  };

  const decodeUtf8 = (buffer) => {
    try {
      const bytes =
        buffer instanceof ArrayBuffer
          ? new Uint8Array(buffer)
          : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      return null;
    }
  };

  const serializeRequestBody = async (body) => {
    if (body == null) {
      return { requestBodyKind: 'empty' };
    }
    if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
      return {};
    }
    if (typeof body === 'string') {
      return {
        requestBody: body,
        requestBodyKind: body.length === 0 ? 'empty' : 'text',
      };
    }
    if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
      const text = body.toString();
      return {
        requestBody: text,
        requestBodyKind: text.length === 0 ? 'empty' : 'text',
      };
    }
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      const params = new URLSearchParams();
      for (const [key, value] of body.entries()) {
        if (typeof value !== 'string') {
          return { requestBodyKind: 'binary' };
        }
        params.append(key, value);
      }
      const text = params.toString();
      return {
        requestBody: text,
        requestBodyKind: text.length === 0 ? 'empty' : 'text',
      };
    }
    if (typeof Blob !== 'undefined' && body instanceof Blob) {
      try {
        const buffer = await body.arrayBuffer();
        const text = decodeUtf8(buffer);
        if (text == null) {
          return { requestBodyKind: 'binary' };
        }
        return {
          requestBody: text,
          requestBodyKind: text.length === 0 ? 'empty' : 'text',
        };
      } catch {
        return { requestBodyKind: 'binary' };
      }
    }
    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
      const text = decodeUtf8(body);
      if (text == null) {
        return { requestBodyKind: 'binary' };
      }
      return {
        requestBody: text,
        requestBodyKind: text.length === 0 ? 'empty' : 'text',
      };
    }
    return {};
  };

  const origFetch = globalThis.fetch;
  if (typeof origFetch === 'function') {
    globalThis.fetch = async function (...args) {
      const startedAt = Date.now();
      const input = args[0];
      const init = args[1] || {};
      const url =
        typeof input === 'string'
          ? input
          : input && input.url
            ? input.url
            : String(input);
      const method = init.method || (input && input.method) || 'GET';
      let requestPayload = {};
      try {
        let body = init.body;
        if (
          body === undefined &&
          typeof Request !== 'undefined' &&
          input instanceof Request
        ) {
          try {
            body = await input.clone().arrayBuffer();
          } catch {
            body = undefined;
          }
        }
        requestPayload = await serializeRequestBody(body);
        post({ method, url, startedAt, ...requestPayload });
      } catch {
        /* ignore */
      }
      const res = await origFetch.apply(this, args);
      try {
        const text = await res.clone().text();
        const settle = {
          method,
          url,
          startedAt,
          responseBody: text,
          responseBodyKind: text.length === 0 ? 'empty' : 'text',
        };
        if (
          requestPayload.requestBodyKind === 'text' ||
          requestPayload.requestBodyKind === 'binary'
        ) {
          Object.assign(settle, requestPayload);
        }
        post(settle);
      } catch {
        /* ignore */
      }
      return res;
    };
  }

  const XHR = globalThis.XMLHttpRequest;
  if (!XHR || !XHR.prototype) {
    return;
  }
  const origOpen = XHR.prototype.open;
  const origSend = XHR.prototype.send;
  XHR.prototype.open = function (method, url, ...rest) {
    this.__modheaderMethod = method;
    this.__modheaderUrl = url;
    return origOpen.call(this, method, url, ...rest);
  };
  XHR.prototype.send = function (body) {
    this.__modheaderStartedAt = Date.now();
    this.__modheaderRequest = {};
    void (async () => {
      try {
        this.__modheaderRequest = await serializeRequestBody(body);
        post({
          method: this.__modheaderMethod || 'GET',
          url: this.__modheaderUrl || '',
          startedAt: this.__modheaderStartedAt,
          ...this.__modheaderRequest,
        });
      } catch {
        /* ignore */
      }
    })();
    this.addEventListener('loadend', function () {
      try {
        const text = this.responseText || '';
        const settle = {
          method: this.__modheaderMethod || 'GET',
          url: this.__modheaderUrl || '',
          startedAt: this.__modheaderStartedAt || Date.now(),
          responseBody: text,
          responseBodyKind: text.length === 0 ? 'empty' : 'text',
        };
        const requestPayload = this.__modheaderRequest || {};
        if (
          requestPayload.requestBodyKind === 'text' ||
          requestPayload.requestBodyKind === 'binary'
        ) {
          Object.assign(settle, requestPayload);
        }
        post(settle);
      } catch {
        /* ignore */
      }
    });
    return origSend.apply(this, arguments);
  };
})();
