// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { captureSize, captureFrame, MAX_CAPTURE_SIDE_PX } from '../capture.js';

/**
 * happy-dom has no real canvas, so the drawing calls are stubbed and the tests
 * assert what was asked of them — the sizes chosen and which path was taken —
 * rather than pixels.
 */
function stubCanvas(toDataURL: () => string): { drawCalls: unknown[][] } {
  const drawCalls: unknown[][] = [];
  const create = document.createElement.bind(document);

  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    const element = create(tag) as HTMLCanvasElement;
    if (tag === 'canvas') {
      element.getContext = (() => ({
        drawImage: (...args: unknown[]) => drawCalls.push(args),
      })) as unknown as HTMLCanvasElement['getContext'];
      element.toDataURL = toDataURL as HTMLCanvasElement['toDataURL'];
    }
    return element;
  }) as typeof document.createElement);

  return { drawCalls };
}

function videoOf(width: number, height: number): HTMLVideoElement {
  const video = document.createElement('video');
  Object.defineProperty(video, 'videoWidth', { value: width });
  Object.defineProperty(video, 'videoHeight', { value: height });
  video.getBoundingClientRect = () =>
    ({ left: 10, top: 20, width: 640, height: 360 }) as DOMRect;
  return video;
}

const tainted = (): never => {
  throw new DOMException('Tainted canvas', 'SecurityError');
};

/**
 * happy-dom's Image never settles, so the screenshot decode has to be stood in
 * for. `naturalWidth` is what the crop derives the device-pixel ratio from.
 */
function stubImage(naturalWidth: number): void {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = naturalWidth;
    naturalHeight = 0;
    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }
  vi.stubGlobal('Image', FakeImage);
}

describe('captureSize', () => {
  it('leaves a frame that already fits alone', () => {
    expect(captureSize({ width: 1280, height: 720 })).toEqual({ width: 1280, height: 720 });
  });

  it('never scales a small frame up', () => {
    expect(captureSize({ width: 320, height: 180 })).toEqual({ width: 320, height: 180 });
  });

  /** The detector resizes past this anyway, so sending more is wasted bytes. */
  it('caps the longest side, keeping the aspect ratio', () => {
    const size = captureSize({ width: 3840, height: 2160 });

    expect(size.width).toBe(MAX_CAPTURE_SIDE_PX);
    expect(size.width / size.height).toBeCloseTo(3840 / 2160, 2);
  });

  it('caps a tall frame on its height', () => {
    expect(captureSize({ width: 1080, height: 3840 }).height).toBe(MAX_CAPTURE_SIDE_PX);
  });

  it('leaves a frame with no dimensions alone', () => {
    expect(captureSize({ width: 0, height: 0 })).toEqual({ width: 0, height: 0 });
  });
});

describe('captureFrame', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('draws the element when the frame is ours to read', async () => {
    stubCanvas(() => 'data:image/png;base64,AAAA');
    const captureTab = vi.fn();

    const capture = await captureFrame(videoOf(1920, 1080), captureTab);

    expect(capture).toEqual({ src: 'data:image/png;base64,AAAA', via: 'canvas' });
    expect(captureTab).not.toHaveBeenCalled();
  });

  /**
   * The point of preferring the canvas: a 1080p stream in an 822px player
   * yields the stream's pixels, not the player's.
   */
  it('draws at the frame resolution rather than the size on screen', async () => {
    const { drawCalls } = stubCanvas(() => 'data:image/png;base64,AAAA');

    await captureFrame(videoOf(1920, 1080), vi.fn());

    expect(drawCalls[0]?.slice(3)).toEqual([1920, 1080]);
  });

  it('refuses a video with no frame yet', async () => {
    stubCanvas(() => 'data:image/png;base64,AAAA');

    await expect(captureFrame(videoOf(0, 0), vi.fn())).rejects.toThrow(/no frame/);
  });

  it('falls back to the tab screenshot when the canvas is tainted', async () => {
    let draws: unknown[][] = [];
    const create = document.createElement.bind(document);
    let first = true;
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const element = create(tag) as HTMLCanvasElement;
      if (tag === 'canvas') {
        element.getContext = (() => ({
          drawImage: (...args: unknown[]) => draws.push(args),
        })) as unknown as HTMLCanvasElement['getContext'];
        // The draw is tainted only on the element itself; the crop that
        // follows reads the screenshot, which is the extension's own.
        element.toDataURL = (first
          ? ((): string => {
              first = false;
              return tainted();
            })
          : () => 'data:image/png;base64,CROP') as HTMLCanvasElement['toDataURL'];
      }
      return element;
    }) as typeof document.createElement);

    window.innerWidth = 1280;
    window.innerHeight = 720;
    stubImage(2560); // a 2x display, so the shot is twice the CSS viewport
    draws = [];

    const captureTab = vi.fn().mockResolvedValue('data:image/png;base64,SHOT');
    const capture = await captureFrame(videoOf(1920, 1080), captureTab);

    expect(captureTab).toHaveBeenCalledTimes(1);
    expect(capture.via).toBe('tab');
    expect(capture.src).toBe('data:image/png;base64,CROP');
    // The video sits at 10,20 and is 640x360 in CSS pixels; at 2x that is the
    // region 20,40 640x720... in device pixels, which is what must be cut out.
    expect(draws.at(-1)?.slice(1, 5)).toEqual([20, 40, 1280, 720]);
  });

  it('does not screenshot the tab for a failure that is not a taint', async () => {
    stubCanvas(() => {
      throw new Error('out of memory');
    });
    const captureTab = vi.fn();

    await expect(captureFrame(videoOf(1920, 1080), captureTab)).rejects.toThrow('out of memory');
    expect(captureTab).not.toHaveBeenCalled();
  });
});
