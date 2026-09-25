import { Heading, Provider, Turn } from '../types';
import { serializeNodeToMarkdown } from '../lib/markdownUtil';
import { inferChatGptOutlineLevels } from './chatgptHeadingLevels';

const getHeadings = (content: HTMLElement): Heading[] => {
    const elements = Array.from(content.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'));
    const outlineLevels = inferChatGptOutlineLevels(elements.map((heading) => ({
        text: heading.innerText.trim(),
        tagName: heading.tagName,
    })));

    return elements.map((heading, index) => {
        const innerText = heading.innerText.trim();
        return {
            innerText: innerText || `Section ${index + 1}`,
            element: heading,
            tagName: heading.tagName,
            outlineLevel: outlineLevels[index],
            isPlaceholder: !innerText,
        };
    });
};

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

                return [{
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
                }];
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
