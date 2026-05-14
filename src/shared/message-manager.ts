import type { BackgroundMessage, BackgroundResponse, ErrorResponse } from './types';

export function sendMessage<T extends BackgroundResponse>(
  message: BackgroundMessage,
  isValid: (r: unknown) => boolean,
  defaultError: string,
  callback: (response: T | ErrorResponse) => void
): void {
  chrome.runtime.sendMessage(message, (response: unknown) => {
    if (chrome.runtime.lastError || !isValid(response)) {
      const r = response as BackgroundResponse | undefined;
      const error = chrome.runtime.lastError?.message
        ?? (r != null && 'error' in r ? (r as ErrorResponse).error : defaultError);
      callback({ success: false, error });
      return;
    }
    callback(response as T);
  });
}
