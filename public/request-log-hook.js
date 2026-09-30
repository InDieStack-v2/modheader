(() => {
  if (globalThis.__modheaderLogBridge) {
    return;
  }
  globalThis.__modheaderLogBridge = true;

  globalThis.addEventListener('message', (event) => {
    if (event.source !== globalThis) {
      return;
    }
    const data = event.data;
    if (data && data.type === 'modheader:ws') {
      try {
        chrome.runtime.sendMessage({ ...data });
      } catch {
        /* ignore */
      }
      return;
    }
    if (!data || data.type !== 'modheader:request-log-body') {
      return;
    }
    try {
      chrome.runtime.sendMessage({
        type: data.type,
        method: data.method,
        url: data.url,
        body: data.body,
        startedAt: data.startedAt,
        requestBody: data.requestBody,
        requestBodyKind: data.requestBodyKind,
        responseBody: data.responseBody,
        responseBodyKind: data.responseBodyKind,
      });
    } catch {
      /* ignore */
    }
  });
})();
