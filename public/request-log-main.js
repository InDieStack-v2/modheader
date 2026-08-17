(() => {
  if (globalThis.__modheaderLogHookInstalled) {
    return;
  }
  globalThis.__modheaderLogHookInstalled = true;

  const post = (method, url, body, startedAt) => {
    try {
      const text =
        typeof body === 'string'
          ? body.length > 65536
            ? body.slice(0, 65536)
            : body
          : '';
      globalThis.postMessage(
        {
          type: 'modheader:request-log-body',
          method: String(method || 'GET').toUpperCase(),
          url: String(url || ''),
          body: text,
          startedAt,
        },
        '*',
      );
    } catch {
      /* ignore */
    }
  };

  const origFetch = globalThis.fetch;
  if (typeof origFetch === 'function') {
    globalThis.fetch = async function (...args) {
      const startedAt = Date.now();
      const res = await origFetch.apply(this, args);
      try {
        const input = args[0];
        const init = args[1] || {};
        const url =
          typeof input === 'string'
            ? input
            : input && input.url
              ? input.url
              : String(input);
        const method = init.method || (input && input.method) || 'GET';
        const text = await res.clone().text();
        post(method, url, text, startedAt);
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
  XHR.prototype.send = function (...args) {
    this.__modheaderStartedAt = Date.now();
    this.addEventListener('loadend', function () {
      try {
        post(
          this.__modheaderMethod || 'GET',
          this.__modheaderUrl || '',
          this.responseText || '',
          this.__modheaderStartedAt || Date.now(),
        );
      } catch {
        /* ignore */
      }
    });
    return origSend.apply(this, args);
  };
})();
