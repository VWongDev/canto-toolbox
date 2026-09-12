import { createElement } from '../shared/dom-element.js';
import { createOverlay } from './overlay.js';
import { ocrClient, type OcrClient } from './ocr-client.js';
import type { OcrResult } from '../shared/types.js';
import ocrStyles from './ocr.scss?inline';

/**
 * Below this an image cannot be holding text a reader wants looked up — it is
 * an icon, an avatar or a tracking pixel. Checking keeps the badge off the
 * furniture of every page.
 */
const MIN_MEDIA_SIDE_PX = 96;

/**
 * A page-scoped `blob:` URL has to be read here and forwarded as bytes, since
 * the offscreen document that runs the model cannot resolve it. This caps what
 * is worth inlining into a message to do so.
 */
const MAX_INLINED_BYTES = 8 * 1024 * 1024;

const BADGE_TITLE = 'Read the Chinese in this image';

type BadgeState = 'idle' | 'reading' | 'failed';

interface Attached {
  overlay: HTMLElement;
  /** Kept so a resize can re-lay the text rather than re-read the image. */
  result: OcrResult;
  width: number;
  height: number;
}

/**
 * Adds image text to what the hover popup can read.
 *
 * Nothing here looks anything up. It turns an image into positioned, invisible
 * text nodes and stops; from that point the popup's own hover handling finds
 * them exactly as it finds text the page wrote itself, which is why studying a
 * word off an image records the same statistics and builds the same flashcards.
 */
export class MediaOcrManager {
  private readonly document: Document;
  private readonly client: OcrClient;
  private readonly attached = new Map<HTMLImageElement, Attached>();
  private badge: HTMLElement | null = null;
  private badgeTarget: HTMLImageElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private repositionFrame: number | null = null;
  private readonly boundMouseOver: (e: MouseEvent) => void;
  private readonly boundReposition: () => void;

  constructor(document: Document, client: OcrClient) {
    this.document = document;
    this.client = client;
    this.boundMouseOver = (e) => this.handleMouseOver(e);
    this.boundReposition = () => this.scheduleReposition();
  }

  /**
   * Scrolling fires far faster than the page repaints, and each reposition
   * measures every overlaid image. A frame is the finest resolution any of
   * this can be seen at, so coalesce to one.
   */
  private scheduleReposition(): void {
    if (this.repositionFrame !== null) return;

    this.repositionFrame = requestAnimationFrame(() => {
      this.repositionFrame = null;
      this.repositionAll();
    });
  }

  init(): void {
    this.injectStyles();
    this.document.addEventListener('mouseover', this.boundMouseOver, true);
    window.addEventListener('scroll', this.boundReposition, true);
    window.addEventListener('resize', this.boundReposition);
    this.resizeObserver = new ResizeObserver(() => this.scheduleReposition());
  }

  destroy(): void {
    this.document.removeEventListener('mouseover', this.boundMouseOver, true);
    window.removeEventListener('scroll', this.boundReposition, true);
    window.removeEventListener('resize', this.boundReposition);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    if (this.repositionFrame !== null) {
      cancelAnimationFrame(this.repositionFrame);
      this.repositionFrame = null;
    }

    for (const { overlay } of this.attached.values()) overlay.remove();
    this.attached.clear();
    this.hideBadge();
  }

  private handleMouseOver(event: MouseEvent): void {
    const target = event.target;

    if (!(target instanceof HTMLImageElement)) {
      // Moving onto the badge itself must not dismiss it.
      const overBadge = target instanceof Element && target.closest('.canto-ocr-badge');
      if (!overBadge) this.hideBadge();
      return;
    }

    if (this.attached.has(target) || !isReadable(target)) {
      this.hideBadge();
      return;
    }

    this.showBadge(target);
  }

  private showBadge(image: HTMLImageElement): void {
    if (this.badgeTarget === image) return;

    this.hideBadge();
    this.badgeTarget = image;
    // The badge is drawn in CSS and carries no text of its own. A Chinese
    // label here would be Chinese on the page: the popup would find it with
    // caretRangeFromPoint, look it up, and cover the image with a definition
    // of the button that was offering to read it.
    this.badge = createElement({
      tag: 'button',
      className: 'canto-ocr-badge',
      dataset: { state: 'idle' },
      attributes: { type: 'button', title: BADGE_TITLE, 'aria-label': BADGE_TITLE },
      listeners: {
        click: (event: Event) => {
          event.preventDefault();
          event.stopPropagation();
          void this.read(image);
        },
      },
    });

    this.document.body.appendChild(this.badge);
    this.positionBadge();
  }

  private hideBadge(): void {
    this.badge?.remove();
    this.badge = null;
    this.badgeTarget = null;
  }

  private setBadgeState(state: BadgeState): void {
    if (!this.badge) return;
    this.badge.dataset.state = state;
    this.badge.toggleAttribute('disabled', state === 'reading');
  }

  private async read(image: HTMLImageElement): Promise<void> {
    this.setBadgeState('reading');

    try {
      const result = await this.requestOcr(await resolveSource(image));
      this.hideBadge();
      if (result.items.length > 0) this.attach(image, result);
    } catch (error) {
      console.error('[OCR] Could not read the image:', error);
      this.setBadgeState('failed');
    }
  }

  private requestOcr(src: string): Promise<OcrResult> {
    return new Promise((resolve, reject) => {
      this.client.readImage(src, (response) => {
        if (response.success) resolve(response.result);
        else reject(new Error(response.error));
      });
    });
  }

  private attach(image: HTMLImageElement, result: OcrResult): void {
    const { width, height } = image.getBoundingClientRect();
    const overlay = createOverlay(result, { width, height });

    this.document.body.appendChild(overlay);
    this.attached.set(image, { overlay, result, width, height });
    this.resizeObserver?.observe(image);
    this.position(image);
  }

  /**
   * Overlays sit in the body rather than beside each image, so that an
   * ancestor's `overflow: hidden` or stacking context cannot clip or bury
   * them. The cost is that they have to be told where their image went.
   */
  private repositionAll(): void {
    for (const [image, entry] of this.attached) {
      if (!image.isConnected) {
        entry.overlay.remove();
        this.attached.delete(image);
        this.resizeObserver?.unobserve(image);
        continue;
      }
      this.position(image);
    }
    this.positionBadge();
  }

  private position(image: HTMLImageElement): void {
    const entry = this.attached.get(image);
    if (!entry) return;

    const rect = image.getBoundingClientRect();

    // The boxes are in the image's own pixels, so what they are worth on screen
    // changes whenever a responsive page redraws the image at a new size. Then
    // and only then is the text laid out again — from the result already held,
    // never by reading the image a second time.
    if (rect.width !== entry.width || rect.height !== entry.height) {
      const replacement = createOverlay(entry.result, { width: rect.width, height: rect.height });
      entry.overlay.replaceWith(replacement);
      entry.overlay = replacement;
      entry.width = rect.width;
      entry.height = rect.height;
    }

    entry.overlay.style.left = `${rect.left + window.scrollX}px`;
    entry.overlay.style.top = `${rect.top + window.scrollY}px`;
    entry.overlay.style.width = `${rect.width}px`;
    entry.overlay.style.height = `${rect.height}px`;
  }

  private positionBadge(): void {
    if (!this.badge || !this.badgeTarget) return;

    if (!this.badgeTarget.isConnected) {
      this.hideBadge();
      return;
    }

    const rect = this.badgeTarget.getBoundingClientRect();
    this.badge.style.left = `${rect.right + window.scrollX}px`;
    this.badge.style.top = `${rect.top + window.scrollY}px`;
  }

  private injectStyles(): void {
    if (this.document.getElementById('canto-ocr-styles')) return;

    const style = createElement<HTMLStyleElement>({ tag: 'style', id: 'canto-ocr-styles' });
    style.textContent = ocrStyles;
    this.document.head.appendChild(style);
  }
}

function isReadable(image: HTMLImageElement): boolean {
  const rect = image.getBoundingClientRect();
  return rect.width >= MIN_MEDIA_SIDE_PX && rect.height >= MIN_MEDIA_SIDE_PX;
}

/**
 * What to hand the offscreen document. An ordinary URL it can fetch itself;
 * a `blob:` one belongs to this page alone, so those bytes travel inline.
 */
async function resolveSource(image: HTMLImageElement): Promise<string> {
  const src = image.currentSrc || image.src;
  if (!src.startsWith('blob:')) return src;

  const blob = await (await fetch(src)).blob();
  if (blob.size > MAX_INLINED_BYTES) {
    throw new Error('Image is too large to read');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read the image data'));
    reader.readAsDataURL(blob);
  });
}

export const mediaOcrManager = new MediaOcrManager(document, ocrClient);
