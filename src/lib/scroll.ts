const SCROLL_OFFSET = 24;
const SCROLL_DURATION = 700;
const INSTANT_JUMP_VIEWPORTS = 1.5;
const CHATGPT_ALIGNMENT_TIMEOUT = 700;
const ALIGNMENT_SETTLE_TIME = 100;
const MAX_LAYOUT_CORRECTIONS = 2;

let activeNavigation: AbortController | undefined;

export function startScrollNavigation(): AbortController {
  activeNavigation?.abort();
  const navigation = new AbortController();
  activeNavigation = navigation;

  const cancel = () => navigation.abort();
  const options = { passive: true, capture: true, signal: navigation.signal };
  for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown', 'popstate']) {
    window.addEventListener(event, cancel, options);
  }
  navigation.signal.addEventListener('abort', () => {
    if (activeNavigation === navigation) activeNavigation = undefined;
  }, { once: true });

  return navigation;
}

const findScrollContainer = (node: HTMLElement): HTMLElement => {
  let parent = node.parentElement;
  while (parent) {
    const { overflowY } = window.getComputedStyle(parent);
    if (/^(auto|scroll|overlay)$/.test(overflowY) && parent.scrollHeight > parent.clientHeight + 1) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return document.scrollingElement as HTMLElement || document.documentElement;
};

const isReversed = (container: HTMLElement) =>
  window.getComputedStyle(container).flexDirection === 'column-reverse';

export const getScrollEnd = (container: HTMLElement) =>
  isReversed(container) ? 0 : Math.max(0, container.scrollHeight - container.clientHeight);

const computeTargetPosition = (node: HTMLElement, container: HTMLElement) => {
  const viewportTop = container === document.scrollingElement
    ? 0
    : container.getBoundingClientRect().top + container.clientTop;
  const target = container.scrollTop + node.getBoundingClientRect().top - viewportTop - SCROLL_OFFSET;
  const range = Math.max(0, container.scrollHeight - container.clientHeight);
  return isReversed(container)
    ? Math.max(-range, Math.min(0, target))
    : Math.max(0, Math.min(range, target));
};

const identifiedBy = (element: HTMLElement | null | undefined, attribute: string) => {
  const value = element?.getAttribute(attribute);
  return value ? `[${attribute}="${CSS.escape(value)}"]` : null;
};

const findIn = (scope: HTMLElement, selector: string) =>
  scope.matches(selector) ? scope : scope.querySelector<HTMLElement>(selector);

const headingText = (node: HTMLElement) => node.textContent?.replace(/\s+/g, ' ').trim();

const getChatGptTarget = (node: HTMLElement, container: HTMLElement) => {
  const turn = node.closest<HTMLElement>('[data-turn-key], [data-turn-id]')
    || node.querySelector<HTMLElement>(':scope > [data-turn-key]');
  const turnSelector = identifiedBy(turn, 'data-turn-key') || identifiedBy(turn, 'data-turn-id');
  if (!turn || !turnSelector) return null;

  const isWrapper = turn.parentElement === node;
  const unit = node.closest<HTMLElement>('[data-content-search-unit-key]');
  const unitSelector = identifiedBy(unit, 'data-content-search-unit-key');
  const source = node.closest<HTMLElement>('[data-dil-source-message-id], [data-dil-message-id], [data-message-id]');
  const sourceSelector = identifiedBy(source, 'data-dil-source-message-id')
    || identifiedBy(source, 'data-dil-message-id') || identifiedBy(source, 'data-message-id');
  const isHeading = /^H[1-6]$/.test(node.tagName);
  const text = headingText(node);
  const findHeadings = (scope: HTMLElement) => Array.from(scope.querySelectorAll<HTMLElement>(node.tagName))
    .filter((heading) => headingText(heading) === text);
  const headingIndex = isHeading ? findHeadings(source || unit || turn).indexOf(node) : -1;
  const rootSelector = node.matches('[data-markdown-text-style]') ? '[data-markdown-text-style]'
    : node.matches('[data-user-message-bubble]') ? '[data-user-message-bubble]' : null;

  return () => {
    if (container.contains(node) && turn.matches(turnSelector)
        && (isWrapper ? turn.parentElement === node : turn.contains(node))
        && (!unitSelector || !!unit?.matches(unitSelector))
        && (!sourceSelector || !!source?.matches(sourceSelector))
        && (!isHeading || headingText(node) === text)
        && node.getBoundingClientRect().height > 0) {
      return node;
    }
    const restoredTurn = findIn(container, turnSelector);
    if (!restoredTurn) return null;
    if (node === turn) return restoredTurn;
    if (isWrapper) return restoredTurn.parentElement;

    const restoredUnit = unitSelector ? findIn(restoredTurn, unitSelector) : restoredTurn;
    if (!restoredUnit) return null;
    if (node === unit) return restoredUnit;

    const restoredSource = sourceSelector ? findIn(restoredUnit, sourceSelector) : restoredUnit;
    if (!restoredSource) return null;
    if (node === source) return restoredSource;
    if (isHeading) return findHeadings(restoredSource)[headingIndex] || null;
    return rootSelector ? findIn(restoredSource, rootSelector) : null;
  };
};

const scrollToChatGptTarget = (
  container: HTMLElement,
  resolveTarget: () => HTMLElement | null,
  targetPosition: number,
  navigation: AbortController,
  chatPath: string,
) => {
  container.scrollTo({ top: targetPosition, behavior: 'instant' });
  const startedAt = performance.now();
  let alignedAt: number | undefined;
  let corrections = 0;

  const align = (now: number) => {
    if (navigation.signal.aborted) return;
    if (!container.isConnected || location.pathname !== chatPath || now - startedAt >= CHATGPT_ALIGNMENT_TIMEOUT) {
      navigation.abort();
      return;
    }

    const target = resolveTarget();
    if (target && target.getBoundingClientRect().height > 0) {
      const position = computeTargetPosition(target, container);
      if (Math.abs(container.scrollTop - position) <= 2) {
        alignedAt ??= now;
        if (now - alignedAt >= ALIGNMENT_SETTLE_TIME) {
          navigation.abort();
          return;
        }
      } else {
        alignedAt = undefined;
        if (corrections >= MAX_LAYOUT_CORRECTIONS) {
          navigation.abort();
          return;
        }
        container.scrollTo({ top: position, behavior: 'instant' });
        corrections += 1;
      }
    } else {
      // Let the virtualizer remount the original target without moving the viewport.
      alignedAt = undefined;
    }

    window.requestAnimationFrame(align);
  };

  window.requestAnimationFrame(align);
};

const smoothScroll = (container: HTMLElement, position: number, navigation: AbortController, chatPath: string) => {
  const start = container.scrollTop;
  const startedAt = performance.now();
  const step = (now: number) => {
    if (navigation.signal.aborted) return;
    if (!container.isConnected || location.pathname !== chatPath) {
      navigation.abort();
      return;
    }
    const progress = Math.min(1, (now - startedAt) / SCROLL_DURATION);
    const eased = 1 - Math.pow(1 - progress, 3);
    container.scrollTo({ top: start + (position - start) * eased, behavior: 'instant' });

    if (progress < 1) window.requestAnimationFrame(step);
    else navigation.abort();
  };
  window.requestAnimationFrame(step);
};

export const highlightNode = (node: HTMLElement) => {
  node.classList.add('scroll-pro-highlight', 'scroll-pro-highlight-active');
  setTimeout(() => {
    node.classList.remove('scroll-pro-highlight-active');
    setTimeout(() => node.classList.remove('scroll-pro-highlight'), 500);
  }, 1500);
};

export const scrollToElement = (
  element: HTMLElement,
  { instant, navigation = startScrollNavigation() }: { instant?: boolean; navigation?: AbortController } = {},
) => {
  if (navigation.signal.aborted) return;
  if (!element.isConnected) {
    navigation.abort();
    return;
  }

  const container = findScrollContainer(element);
  const target = computeTargetPosition(element, container);
  const chatPath = location.pathname;
  const resolveTarget = location.hostname.includes('chatgpt') || location.hostname.includes('openai')
    ? getChatGptTarget(element, container) : null;

  if (resolveTarget) {
    scrollToChatGptTarget(container, resolveTarget, target, navigation, chatPath);
  } else if (instant || Math.abs(container.scrollTop - target) > container.clientHeight * INSTANT_JUMP_VIEWPORTS
      || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    container.scrollTo({ top: target, behavior: 'instant' });
    navigation.abort();
  } else {
    smoothScroll(container, target, navigation, chatPath);
  }
};
