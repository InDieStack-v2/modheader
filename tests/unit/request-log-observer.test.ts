import { describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createProfile } from '~/lib/profiles';
import {
  getRequestLogState,
  setRecording,
  subscribeRequestLog,
} from '~/lib/session-log';
import { startRequestLogObserver } from '~/lib/request-log-observer';

type RequestDetails = {
  requestId: string;
  url: string;
  method: string;
  type: string;
  tabId: number;
  statusCode?: number;
};

type Listener<T> = (details: T) => void;

function webRequestEvent<T>() {
  const listeners: Listener<T>[] = [];
  return {
    addListener(listener: Listener<T>) {
      listeners.push(listener);
    },
    dispatch(details: T) {
      for (const listener of listeners) {
        listener(details);
      }
    },
  };
}

describe('request-log observer lifecycle', () => {
  it('does not retain completed request rows for a reused request id', async () => {
    const onBeforeRequest = webRequestEvent<RequestDetails>();
    const onSendHeaders = webRequestEvent<RequestDetails>();
    const onHeadersReceived = webRequestEvent<RequestDetails>();
    const onCompleted = webRequestEvent<RequestDetails>();
    const onErrorOccurred = webRequestEvent<RequestDetails>();
    Object.assign(fakeBrowser, {
      webRequest: {
        onBeforeRequest,
        onSendHeaders,
        onHeadersReceived,
        onCompleted,
        onErrorOccurred,
      },
    });

    const profile = createProfile([]);
    profile.headers = [{ enabled: true, name: 'X-Observed', value: '1' }];
    await fakeBrowser.storage.local.set({
      profiles: [profile],
      selectedProfileIndex: 0,
    });
    await setRecording(0, true);
    startRequestLogObserver();

    const waitForCompletedUrl = (url: string) =>
      new Promise<void>((resolve) => {
        const off = subscribeRequestLog((state) => {
          const row = state.entries[0]?.[0];
          if (row?.url === url && row.status === 200) {
            off();
            resolve();
          }
        });
      });

    const first: RequestDetails = {
      requestId: 'reused-id',
      url: 'https://example.com/first',
      method: 'GET',
      type: 'xmlhttprequest',
      tabId: 1,
      statusCode: 200,
    };
    const firstCompleted = waitForCompletedUrl(first.url);
    onBeforeRequest.dispatch(first);
    onCompleted.dispatch(first);
    await firstCompleted;

    const second: RequestDetails = {
      ...first,
      url: 'https://example.com/second',
    };
    const secondCompleted = waitForCompletedUrl(second.url);
    onBeforeRequest.dispatch(second);
    onCompleted.dispatch(second);
    await secondCompleted;

    const state = await getRequestLogState();
    expect(state.entries[0]).toHaveLength(1);
    expect(state.entries[0]![0]).toMatchObject({
      id: 'reused-id',
      url: 'https://example.com/second',
      status: 200,
    });
  });
});
