import { Heading, HeadingPart, Provider, Turn } from '../types';
import { serializeNodeToMarkdown } from '../lib/markdownUtil';
import { inferChatGptOutlineLevels } from './chatgptHeadingLevels';
import { findAssistantMessageStarts } from './chatgptMessageBoundaries';

const getHeadingParts = (node: Node): HeadingPart[] => {
    if (node.nodeType === Node.TEXT_NODE) {
        return [{ kind: 'text', value: node.textContent || '' }];
    }
    if (!(node instanceof HTMLElement)) return [];

    // ChatGPT includes MathML, TeX annotation, and visual KaTeX markup for
    // one formula. Reading innerText collects more than one representation.
    const mathSource = node.getAttribute('data-math-source') ||
        (node.classList.contains('katex')
            ? node.querySelector('annotation[encoding="application/x-tex"]')?.textContent
            : null);
    if (mathSource) {
        const math = node.querySelector('math');
        const firstChild = math?.firstElementChild;
        const expression = firstChild?.localName === 'semantics'
            ? firstChild.firstElementChild
            : firstChild;
        return [{
            kind: 'math',
            value: mathSource,
            // The annotation repeats the TeX source; only the expression is
            // needed for native MathML rendering in the sidebar.
            mathml: expression
                ? `<math xmlns="http://www.w3.org/1998/Math/MathML">${expression.outerHTML}</math>`
                : undefined,
        }];
    }
    if (node.getAttribute('aria-hidden') === 'true') return [];
    return Array.from(node.childNodes).flatMap(getHeadingParts);
};

const getHeadings = (content: HTMLElement): Heading[] => {
    const elements = Array.from(content.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'));
    return getHeadingsFromElements(elements);
};

const getHeadingsFromElements = (elements: HTMLElement[]): Heading[] => {
    const headingParts = elements.map(getHeadingParts);
    const headingTexts = headingParts.map((parts) => parts.map((part) => part.value).join('').replace(/\s+/g, ' ').trim());
    const outlineLevels = inferChatGptOutlineLevels(elements.map((heading, index) => ({
        text: headingTexts[index],
        tagName: heading.tagName,
    })));

    return elements.map((heading, index) => {
        const innerText = headingTexts[index];
        return {
            innerText: innerText || `Section ${index + 1}`,
            parts: headingParts[index],
            element: heading,
            tagName: heading.tagName,
            outlineLevel: outlineLevels[index],
            isPlaceholder: !innerText,
        };
    });
};

const getHeadingsFromNodes = (nodes: HTMLElement[]): Heading[] => getHeadingsFromElements(
    nodes.flatMap((node) => [
        ...(node.matches('h1, h2, h3, h4, h5, h6') ? [node] : []),
        ...Array.from(node.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')),
    ])
);

const getCurrentTurns = (container: HTMLElement): Turn[] => {
    const turnElements = Array.from(container.querySelectorAll<HTMLElement>('[data-turn-key]'));
    return turnElements.flatMap((turnElement, turnIndex) => {
        const turnKey = turnElement.getAttribute('data-turn-key') || `turn-${turnIndex}`;
        const timeLabel = turnElement.querySelector<HTMLElement>(
            '[data-content-search-turn-key] > [role="separator"][aria-label]'
        )?.getAttribute('aria-label')?.trim() || undefined;

        return Array.from(turnElement.querySelectorAll<HTMLElement>('[data-content-search-unit-key]'))
            .flatMap((unit, unitIndex): Turn[] => {
                const unitKey = unit.getAttribute('data-content-search-unit-key') || '';
                const role = unitKey.endsWith(':user')
                    ? 'user'
                    : unitKey.endsWith(':assistant')
                        ? 'assistant'
                        : null;
                if (!role) return [];

                const content = role === 'user'
                    ? unit.querySelector<HTMLElement>('[data-user-message-bubble]')
                    : unit.querySelector<HTMLElement>('[data-markdown-text-style]');
                const element = content || unit;
                const text = (element.innerText || '').trim();
                const id = `gpt-${turnKey}-${unitKey || unitIndex}`;

                const baseTurn: Turn = {
                    id,
                    turnId: id,
                    role,
                    element,
                    text,
                    headings: role === 'assistant' ? getHeadings(element) : [],
                    contextLabel: role === 'assistant'
                        ? unit.querySelector<HTMLElement>(':scope > button span.truncate')?.innerText.trim() || undefined
                        : undefined,
                    timeLabel: role === 'assistant' ? timeLabel : undefined,
                };
                if (role !== 'assistant' || !content || !baseTurn.contextLabel) return [baseTurn];

                const children = Array.from(content.children) as HTMLElement[];
                const messageIds = (unit.getAttribute('data-chatgpt-search-message-ids') || '')
                    .split(/\s+/).filter(Boolean);
                const starts = findAssistantMessageStarts(children.map((child) => ({
                    sourceMessageId: child.getAttribute('data-dil-source-message-id'),
                    tagName: child.tagName,
                    text: child.textContent || '',
                })), messageIds);
                if (starts.length === 1) return [baseTurn];

                return starts.map((start, segmentIndex): Turn => {
                    const end = starts[segmentIndex + 1] ?? children.length;
                    const nodes = children.slice(start, end);
                    const range = content.ownerDocument.createRange();
                    range.setStartBefore(nodes[0]);
                    range.setEndAfter(nodes[nodes.length - 1]);
                    const headings = getHeadingsFromNodes(nodes);
                    if (segmentIndex > 0 && nodes[0].tagName === 'H1' && headings[0]?.element === nodes[0]) {
                        headings[0].outlineLevel = 0;
                    }
                    const segmentId = `${id}-message-${segmentIndex}`;
                    return {
                        ...baseTurn,
                        id: segmentId,
                        turnId: segmentId,
                        element: nodes[0],
                        contentRange: range,
                        text: nodes.map((node) => node.innerText || node.textContent || '').join('\n\n').trim(),
                        headings,
                        contextLabel: segmentIndex === 0 ? undefined : baseTurn.contextLabel,
                        timeLabel: segmentIndex === 0 ? baseTurn.timeLabel : undefined,
                    };
                });
            });
    });
};

export const chatgpt: Provider = {
    name: 'chatgpt',
    isMatch: () => window.location.hostname.includes('chatgpt') || window.location.hostname.includes('openai'),
    scrollContainerSelector: 'main, main div[class*="overflow-y-auto"]',
    getTurns: (container: HTMLElement): Turn[] => {
        if (container.querySelector('[data-turn-key]')) {
            return getCurrentTurns(container);
        }

        const articleSelector = 'section[data-turn], section[data-testid^="conversation-turn"], article[data-turn], article[data-testid^="conversation-turn"]';
        let articles = Array.from(container.querySelectorAll<HTMLElement>(articleSelector));
        if (!articles.length) {
            articles = Array.from(document.querySelectorAll<HTMLElement>(articleSelector));
        }
        return articles.map((article, index) => {
            const roleAttr = article.getAttribute('data-turn');
            const role = roleAttr === 'user'
                ? 'user'
                : roleAttr === 'assistant'
                    ? 'assistant'
                    : (article.querySelector('[data-message-author-role="user"]') ? 'user' : 'assistant');
            const turnId = article.getAttribute('data-turn-id') ||
                article.querySelector('[data-message-id]')?.getAttribute('data-message-id') ||
                undefined; // Stable ID from ChatGPT
            let text = '';
            let headings: any[] = [];
            let contextLabel: string | undefined;
            let timeLabel: string | undefined;

            if (role === 'user') {
                const textEl = article.querySelector('[data-message-author-role="user"]');
                if (textEl) {
                    // Prefer the text bubble only, excluding file attachment tiles
                    const textBubble = textEl.querySelector('.whitespace-pre-wrap');
                    if (textBubble) {
                        text = serializeNodeToMarkdown(textBubble as HTMLElement) || (textBubble as HTMLElement).innerText || '';
                    }
                    // Fallback to full content for file-only messages
                    if (!text) {
                        text = serializeNodeToMarkdown(textEl) || (textEl as HTMLElement).innerText || '';
                    }
                }
            } else {
                const contentEl = article.querySelector('[data-message-author-role="assistant"]');
                if (contentEl) {
                    text = serializeNodeToMarkdown(contentEl) || (contentEl as HTMLElement).innerText || '';
                    const taskTitleEl = article.querySelector<HTMLElement>(
                        '[data-conversation-screenshot-content] > div > button > span.truncate'
                    );
                    contextLabel = taskTitleEl?.innerText?.trim() || undefined;

                    const previousSibling = article.previousElementSibling;
                    if (previousSibling?.matches('[role="separator"][aria-label]')) {
                        timeLabel = previousSibling.getAttribute('aria-label')?.trim() || undefined;
                    }

                    headings = getHeadings(contentEl as HTMLElement);
                }
            }
            return {
                id: `gpt-${index}`,
                turnId, // Add stable turn ID
                role,
                element: article as HTMLElement,
                text,
                headings,
                contextLabel,
                timeLabel
            };
        });
    },
    getChatTitle: () => {
        return document.title || null;
    }
};
