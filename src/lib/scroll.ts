// Nudge target down slightly so it renders at the top of the visible area (avoids sticky headers)
const SCROLL_OFFSET = 24;
const SCROLL_DURATION = 700;
const INSTANT_JUMP_VIEWPORTS = 1.5;

const findScrollContainer = (node: HTMLElement): HTMLElement | Window => {
  let scrollContainer: HTMLElement | Window = window;
  let parent = node.parentElement;
  while (parent) {
    const overflow = window.getComputedStyle(parent).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') {
      scrollContainer = parent;
      break;
    }
    parent = parent.parentElement;
  }
  return scrollContainer;
};

const prefersReducedMotion = () => {
  try {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

const computeTargetPosition = (
  node: HTMLElement,
  scrollContainer: HTMLElement | Window,
  containerIsWindow: boolean
) => {
  const rect = node.getBoundingClientRect();
  const containerRect = containerIsWindow ? undefined : (scrollContainer as HTMLElement).getBoundingClientRect();
  const scrollTop = containerIsWindow ? window.scrollY : (scrollContainer as HTMLElement).scrollTop;
  const rawTarget = containerIsWindow
    ? rect.top + window.scrollY
    : rect.top + scrollTop - (containerRect?.top ?? 0);
  const target = rawTarget - SCROLL_OFFSET;
  if (!containerIsWindow && window.getComputedStyle(scrollContainer as HTMLElement).flexDirection === 'column-reverse') {
    // ChatGPT's reversed scroller uses negative scrollTop values for older content.
    return Math.min(0, target);
  }
  return Math.max(0, target);
};

const smoothScroll = (scrollContainer: HTMLElement | Window, targetPosition: number) => {
  const containerIsWindow = scrollContainer === window;
  const getScroll = () => (containerIsWindow ? window.scrollY : (scrollContainer as HTMLElement).scrollTop);
  const setScroll = (value: number) => {
    if (containerIsWindow) {
      window.scrollTo({ top: value });
    } else {
      (scrollContainer as HTMLElement).scrollTop = value;
    }
  };

  if (prefersReducedMotion()) {
    setScroll(targetPosition);
    return;
  }

  const start = getScroll();
  const distance = targetPosition - start;
  if (Math.abs(distance) < 1) {
    setScroll(targetPosition);
    return;
  }

  const cancelEvents: (keyof DocumentEventMap)[] = ['wheel', 'touchstart', 'mousedown', 'keydown'];
  let canceled = false;

  const cancel = () => {
    canceled = true;
    cleanup();
  };

  const cleanup = () => {
    cancelEvents.forEach((event) => window.removeEventListener(event, cancel, true));
  };

  cancelEvents.forEach((event) => window.addEventListener(event, cancel, { passive: true, capture: true }));

  const startTime = performance.now();
  const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

  const step = () => {
    if (canceled) return;
    const now = performance.now();
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / SCROLL_DURATION);
    const eased = easeOutCubic(t);
    setScroll(start + distance * eased);

    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      // Snap to target in case layout shifted during animation
      setScroll(targetPosition);
      cleanup();
    }
  };

  requestAnimationFrame(step);
};

const scrollNodeIntoViewWithOffset = (node: HTMLElement, instant = false) => {
  const scrollContainer = findScrollContainer(node);
  const containerIsWindow = scrollContainer === window;
  const targetPosition = computeTargetPosition(node, scrollContainer, containerIsWindow);

  const currentPosition = containerIsWindow ? window.scrollY : (scrollContainer as HTMLElement).scrollTop;
  const viewportHeight = containerIsWindow ? window.innerHeight : (scrollContainer as HTMLElement).clientHeight;
  if (instant || Math.abs(targetPosition - currentPosition) > viewportHeight * INSTANT_JUMP_VIEWPORTS) {
    // ChatGPT virtualizes long conversations. Animating through thousands of
    // pixels lets it replace turn nodes and shift the target during the jump.
    const setPosition = (position: number) => {
      if (containerIsWindow) window.scrollTo({ top: position });
      else (scrollContainer as HTMLElement).scrollTop = position;
    };
    const sourceRoot = node.closest<HTMLElement>('[data-dil-source-message-id]');
    const sourceMessageId = sourceRoot?.getAttribute('data-dil-source-message-id');
    const messageId = node.closest('[data-dil-message-id]')?.getAttribute('data-dil-message-id');
    const virtualTurn = node.closest<HTMLElement>('[data-turn-key]') || node.querySelector<HTMLElement>('[data-turn-key]');
    const virtualTurnKey = virtualTurn?.getAttribute('data-turn-key');
    const isVirtualWrapper = virtualTurn?.parentElement === node;
    const unitKey = node.closest('[data-content-search-unit-key]')?.getAttribute('data-content-search-unit-key');
    const turnSearchKey = (node.closest('[data-content-search-turn-key]')
      || virtualTurn?.querySelector('[data-content-search-turn-key]'))?.getAttribute('data-content-search-turn-key');
    const turnIndex = Number(turnSearchKey?.match(/^fallback-turn-(\d+)$/)?.[1]);
    const turnTimestamp = Date.parse(virtualTurn?.querySelector('time[datetime]')?.getAttribute('datetime') || '');
    const isMarkdownRoot = node.hasAttribute('data-markdown-text-style');
    const isUserBubble = node.hasAttribute('data-user-message-bubble');
    const headingText = node.textContent?.replace(/\s+/g, ' ').trim();
    let activeNode = node;
    const resolveTarget = () => {
      if (activeNode.isConnected && activeNode.getBoundingClientRect().height > 0) return activeNode;
      const response = sourceMessageId
        ? Array.from(document.querySelectorAll<HTMLElement>('[data-dil-source-message-id]'))
          .find((candidate) => candidate.getAttribute('data-dil-source-message-id') === sourceMessageId
            && candidate.getBoundingClientRect().height > 0)
        : Array.from(document.querySelectorAll<HTMLElement>('[data-dil-message-id]'))
          .find((candidate) => candidate.getAttribute('data-dil-message-id') === messageId
            && candidate.getBoundingClientRect().height > 0);
      if (!response) {
        if (isVirtualWrapper && virtualTurnKey) {
          const restoredTurn = Array.from(document.querySelectorAll<HTMLElement>('[data-turn-key]'))
            .find((candidate) => candidate.getAttribute('data-turn-key') === virtualTurnKey
              && candidate.getBoundingClientRect().height > 0);
          if (restoredTurn?.parentElement) {
            activeNode = restoredTurn.parentElement;
            return activeNode;
          }
        }
        if (!unitKey) return null;
        const unit = Array.from(document.querySelectorAll<HTMLElement>('[data-content-search-unit-key]'))
          .find((candidate) => candidate.getAttribute('data-content-search-unit-key') === unitKey
            && candidate.getBoundingClientRect().height > 0);
        const restored = isMarkdownRoot
          ? unit?.querySelector<HTMLElement>('[data-markdown-text-style]')
          : isUserBubble
            ? unit?.querySelector<HTMLElement>('[data-user-message-bubble]')
            : null;
        if (restored) activeNode = restored;
        return restored || null;
      }
      if (node === sourceRoot) {
        activeNode = response;
        return activeNode;
      }
      if (!headingText) return null;
      const matched = Array.from(response.querySelectorAll<HTMLElement>(node.tagName.toLowerCase()))
        .find((candidate) => candidate.textContent?.replace(/\s+/g, ' ').trim() === headingText);
      if (matched) activeNode = matched;
      return matched || null;
    };

    let canceled = false;
    const cancelEvents: (keyof DocumentEventMap)[] = ['wheel', 'touchstart', 'mousedown', 'keydown'];
    const cancel = () => { canceled = true; };
    cancelEvents.forEach((event) => window.addEventListener(event, cancel, { passive: true, capture: true }));
    const startedAt = performance.now();
    let lastCorrectionAt = startedAt;
    let lastDirection = 0;
    let lostSteps = 0;
    let missingFrames = 0;
    const alignAfterLayout = () => {
      const now = performance.now();
      if (canceled || now - startedAt > 8000 || (now - startedAt > 900 && now - lastCorrectionAt > 900)) {
        cancelEvents.forEach((event) => window.removeEventListener(event, cancel, true));
        return;
      }
      const currentTarget = resolveTarget();
      if (currentTarget) {
        lostSteps = 0;
        missingFrames = 0;
        const correctedPosition = computeTargetPosition(currentTarget, scrollContainer, containerIsWindow);
        const actualPosition = containerIsWindow ? window.scrollY : (scrollContainer as HTMLElement).scrollTop;
        const remaining = correctedPosition - actualPosition;
        if (Math.abs(remaining) > 2) {
          const step = Math.sign(remaining) * Math.min(Math.abs(remaining), viewportHeight * 0.75);
          lastDirection = Math.sign(step);
          lastCorrectionAt = now;
          setPosition(actualPosition + step);
        }
      } else {
        missingFrames += 1;
        if (missingFrames % 3 === 0) {
          const scope = containerIsWindow ? document : scrollContainer as HTMLElement;
          const mounted = Array.from(scope.querySelectorAll<HTMLElement>('[data-content-search-turn-key]'))
            .filter((turn) => turn.getBoundingClientRect().height > 0)
            .map((turn) => Number(turn.getAttribute('data-content-search-turn-key')?.match(/^fallback-turn-(\d+)$/)?.[1]))
            .filter(Number.isFinite);
          const mountedTimes = Array.from(scope.querySelectorAll<HTMLElement>('[data-turn-key]'))
            .filter((turn) => turn.getBoundingClientRect().height > 0)
            .map((turn) => Date.parse(turn.querySelector('time[datetime]')?.getAttribute('datetime') || ''))
            .filter(Number.isFinite);
          const direction = Number.isFinite(turnIndex) && mounted.length
            ? turnIndex > Math.max(...mounted) ? 1 : turnIndex < Math.min(...mounted) ? -1 : 0
            : Number.isFinite(turnTimestamp) && mountedTimes.length
              ? turnTimestamp > Math.max(...mountedTimes) ? 1 : turnTimestamp < Math.min(...mountedTimes) ? -1 : 0
            : lastDirection && lostSteps < 4 ? lastDirection : 0;
          if (direction) {
            const actualPosition = containerIsWindow ? window.scrollY : (scrollContainer as HTMLElement).scrollTop;
            setPosition(actualPosition + direction * viewportHeight * 0.6);
            lastCorrectionAt = now;
            lostSteps += 1;
          }
        }
      }
      window.requestAnimationFrame(alignAfterLayout);
    };
    window.requestAnimationFrame(alignAfterLayout);
    return { scrollContainer, targetPosition };
  }

  smoothScroll(scrollContainer, targetPosition);

  return { scrollContainer, targetPosition };
};

export const highlightNode = (node: HTMLElement) => {
  // Add highlight with animation
  node.classList.add('scroll-pro-highlight', 'scroll-pro-highlight-active');

  // Trigger fade out after 1.5s
  setTimeout(() => {
    node.classList.remove('scroll-pro-highlight-active');
    // Remove base class after animation completes (0.5s transition)
    setTimeout(() => node.classList.remove('scroll-pro-highlight'), 500);
  }, 1500);
};

export const scrollToElement = (element: HTMLElement, options: { instant?: boolean } = {}) => {
  if (!element) return;
  scrollNodeIntoViewWithOffset(element, options.instant);
};
