/** An image or a video — anything on the page that can be holding Chinese. */
export type MediaElement = HTMLImageElement | HTMLVideoElement;

export interface Size {
  width: number;
  height: number;
}

/**
 * Longest side of what is sent for recognition. The detector resizes anything
 * larger to about this anyway, so a bigger capture costs message size and
 * encoding time and buys nothing.
 */
export const MAX_CAPTURE_SIDE_PX = 1920;

/**
 * Where a capture's pixels came from. Reported so a failure names the path
 * that failed rather than just "could not read".
 */
export type CaptureVia = 'url' | 'canvas' | 'tab';

export interface Capture {
  /** A `data:` URL, or the media's own URL when the engine can fetch it itself. */
  src: string;
  via: CaptureVia;
}

/** A frame's own pixel dimensions, which the overlay measures its boxes against. */
export function naturalSize(media: MediaElement): Size {
  return media instanceof HTMLVideoElement
    ? { width: media.videoWidth, height: media.videoHeight }
    : { width: media.naturalWidth, height: media.naturalHeight };
}

/** Scaled to fit `MAX_CAPTURE_SIDE_PX`, never scaled up. */
export function captureSize({ width, height }: Size): Size {
  const longest = Math.max(width, height);
  if (longest <= MAX_CAPTURE_SIDE_PX || longest === 0) return { width, height };

  const scale = MAX_CAPTURE_SIDE_PX / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Draws the current frame and encodes it.
 *
 * Throws `SecurityError` when the media is cross-origin without CORS, which is
 * the signal to fall back to capturing the tab: the pixels are on screen, they
 * are just not ours to read this way. Media-Source video — what every streaming
 * player uses — is fed by the page itself and so is *not* tainted, which is why
 * this path works where re-fetching a URL cannot.
 */
export function drawToDataUrl(media: MediaElement, size: Size): string {
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('No 2D context for the capture canvas');

  context.drawImage(media, 0, 0, size.width, size.height);
  return canvas.toDataURL('image/png');
}

/**
 * Cuts `rect` (in CSS pixels) out of a whole-viewport screenshot.
 *
 * The screenshot is in device pixels, so everything is scaled by the ratio the
 * shot was actually taken at — derived from the image rather than assumed from
 * `devicePixelRatio`, which lies on a zoomed page.
 */
export function cropToRect(
  shot: HTMLImageElement,
  rect: Size & { left: number; top: number },
  viewport: Size,
): string {
  const scale = viewport.width > 0 ? shot.naturalWidth / viewport.width : 1;
  const target = captureSize({ width: rect.width * scale, height: rect.height * scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(target.width));
  canvas.height = Math.max(1, Math.round(target.height));

  const context = canvas.getContext('2d');
  if (!context) throw new Error('No 2D context for the crop canvas');

  context.drawImage(
    shot,
    rect.left * scale,
    rect.top * scale,
    rect.width * scale,
    rect.height * scale,
    0,
    0,
    canvas.width,
    canvas.height,
  );

  return canvas.toDataURL('image/png');
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not decode the captured tab'));
    image.src = src;
  });
}

/**
 * The current frame of a video, by whichever route can actually read it.
 *
 * Drawing the element is tried first: it is free, needs no permission, and
 * yields the video's own resolution — on a 1080p stream in an 822px-wide
 * player that is over twice the linear resolution a screenshot of the tab
 * would give, which is most of the difference between reading subtitles and
 * guessing at them. Only when the frame is not ours to read does it fall back
 * to the screenshot, which sees composited pixels and so is blind to nothing
 * except DRM.
 */
export async function captureFrame(
  video: HTMLVideoElement,
  captureTab: () => Promise<string>,
): Promise<Capture> {
  const size = captureSize(naturalSize(video));
  if (size.width === 0 || size.height === 0) {
    throw new Error('The video has no frame to read yet');
  }

  try {
    return { src: drawToDataUrl(video, size), via: 'canvas' };
  } catch (error) {
    // Only a tainted canvas is worth a second attempt; anything else is ours.
    if (!(error instanceof DOMException) || error.name !== 'SecurityError') throw error;
  }

  const shot = await loadImage(await captureTab());
  const rect = video.getBoundingClientRect();
  return {
    src: cropToRect(
      shot,
      { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      { width: window.innerWidth, height: window.innerHeight },
    ),
    via: 'tab',
  };
}
