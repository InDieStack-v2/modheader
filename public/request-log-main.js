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

  // --- WebSocket capture (spec 006, contracts/ws-hook-messages.md) ---
  const WS_MAX = 65536;
  const OrigWebSocket = globalThis.WebSocket;

  const postWs = (payload) => {
    try {
      globalThis.postMessage({ type: 'modheader:ws', at: Date.now(), ...payload }, '*');
    } catch {
      /* ignore */
    }
  };

  const bytesToBase64 = (bytes) => {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  };

  const toBytes = (data) => {
    if (data instanceof ArrayBuffer) {
      return new Uint8Array(data);
    }
    if (ArrayBuffer.isView(data)) {
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
    return null;
  };

  /** Serialize one frame; Blob payloads resolve asynchronously. */
  const serializeFrame = async (data) => {
    if (typeof data === 'string') {
      const size = new TextEncoder().encode(data).length;
      const truncated = data.length > WS_MAX;
      return {
        kind: 'text',
        data: truncated ? data.slice(0, WS_MAX) : data,
        size,
        truncated,
      };
    }
    if (typeof Blob !== 'undefined' && data instanceof Blob) {
      const truncated = data.size > WS_MAX;
      const bytes = new Uint8Array(
        await data.slice(0, WS_MAX).arrayBuffer(),
      );
      return {
        kind: 'binary',
        data: bytesToBase64(bytes),
        size: data.size,
        truncated,
      };
    }
    const bytes = toBytes(data);
    if (!bytes) {
      return null;
    }
    const truncated = bytes.length > WS_MAX;
    return {
      kind: 'binary',
      data: bytesToBase64(truncated ? bytes.subarray(0, WS_MAX) : bytes),
      size: bytes.length,
      truncated,
    };
  };

  if (typeof OrigWebSocket === 'function') {
    let nextSocketId = 1;
    const recordFrame = (socketId, seq, dir, data) => {
      const at = Date.now();
      void (async () => {
        try {
          const frame = await serializeFrame(data);
          if (frame) {
            postWs({ event: 'message', socketId, seq, dir, ...frame, at });
          }
        } catch {
          /* ignore */
        }
      })();
    };

    class ModheaderWebSocket extends OrigWebSocket {
      constructor(...args) {
        super(...args);
        const socketId = nextSocketId++;
        let seq = 0;
        this.__modheaderSocketId = socketId;
        this.__modheaderNextSeq = () => ++seq;
        try {
          this.addEventListener('open', () => {
            postWs({ event: 'open', socketId, url: this.url });
          });
          this.addEventListener('message', (event) => {
            recordFrame(socketId, ++seq, 'received', event.data);
          });
          this.addEventListener('close', (event) => {
            postWs({ event: 'close', socketId, code: event.code, reason: event.reason });
          });
          this.addEventListener('error', () => {
            postWs({ event: 'error', socketId });
          });
        } catch {
          /* ignore */
        }
      }

      send(data) {
        // Throws in CONNECTING state; only record frames that were accepted.
        const result = super.send(data);
        try {
          recordFrame(this.__modheaderSocketId, this.__modheaderNextSeq(), 'sent', data);
        } catch {
          /* ignore */
        }
        return result;
      }
    }

    try {
      Object.defineProperty(ModheaderWebSocket, 'name', { value: 'WebSocket' });
      globalThis.WebSocket = ModheaderWebSocket;
    } catch {
      /* ignore */
    }
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
    }, { once: true });
    return origSend.apply(this, arguments);
  };
})();
