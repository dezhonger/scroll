type HeadingOutlineInput = {
    text: string;
    tagName: string;
};

const CHINESE_SECTION_PREFIX = /^(?:第[一二三四五六七八九十百零〇两]+[章节部分篇]|[一二三四五六七八九十百零〇两]+)[、.．]\s*/;
const ARABIC_LIST_PREFIX = /^(\d+)[.)、．]\s+/;
const CHAPTER_TITLE_DELIMITER = /[｜|]/;
const TRAILING_TOP_LEVEL_PREFIX = /^(?:今日.*总结|本日.*总结|(?:全文|总体|最后)?总结|结语|附录|参考资料)(?:[:：\s]|$)/;

const getRawHeadingLevel = (tagName: string) => {
    const match = tagName.match(/^H([1-6])$/i);
    return match ? Number(match[1]) : 6;
};

const getArabicListNumber = (text: string) => {
    const match = text.trim().match(ARABIC_LIST_PREFIX);
    return match ? Number(match[1]) : null;
};

const isIncreasingNumberedRun = (numbers: number[]) => (
    numbers.length >= 2 &&
    numbers[0] === 1 &&
    numbers.every((number, index) => index === 0 || number > numbers[index - 1])
);

const findTopLevelArabicChapters = (headings: HeadingOutlineInput[], rawLevels: number[]) => {
    const numbered = headings
        .map((heading, index) => ({ index, number: getArabicListNumber(heading.text), level: rawLevels[index] }))
        .filter((entry): entry is { index: number; number: number; level: number } => entry.number !== null);

    // Repeated H1 chapter titles with a common title/subtitle separator are
    // stronger evidence than incidental numbered H1s nested inside them.
    const delimitedChapters = numbered.filter((entry) =>
        entry.level === 1 && CHAPTER_TITLE_DELIMITER.test(headings[entry.index].text)
    );
    if (delimitedChapters.length >= 3 &&
        delimitedChapters[0].number === 1 &&
        delimitedChapters.every((entry, index) => entry.number === index + 1)) {
        return delimitedChapters.map((entry) => entry.index);
    }

    let bestRun: number[] = [];
    numbered.forEach((start, startPosition) => {
        // A run below an introductory H1 is probably a subsection list. An
        // H1-numbered run after that title, however, is a chapter outline.
        if (start.number !== 1 || (start.index !== 0 && start.level !== 1) || start.level > 2) return;

        const run = [start.index];
        for (const entry of numbered.slice(startPosition + 1)) {
            if (start.level === 2 && entry.number === 1 && entry.level > 2) break;
            if (entry.level > start.level) continue;
            if (entry.number !== run.length + 1) break;
            run.push(entry.index);
        }
        if (run.length >= 3 && run.length > bestRun.length) bestRun = run;
    });
    return bestRun;
};

/**
 * ChatGPT occasionally emits inconsistent Markdown heading markers inside an
 * otherwise clearly numbered outline. Keep ordinary responses literal, but
 * repair the two unambiguous signals used by these structured answers:
 *
 * - Chinese chapter labels (一、二、三…) are sibling top-level sections.
 * - A consecutive 1., 2., 3. run inside one chapter is one sibling level,
 *   using the first item's level as the intended depth.
 * - A clear top-level 1., 2., 3. chapter sequence may follow a document title;
 *   headings inside those chapters are not also top-level sections.
 */
export const inferChatGptOutlineLevels = (headings: HeadingOutlineInput[]) => {
    const levels = headings.map((heading) => getRawHeadingLevel(heading.tagName));
    const arabicChapters = findTopLevelArabicChapters(headings, levels);
    if (arabicChapters.length >= 3) {
        const firstChapter = arabicChapters[0];
        if (
            firstChapter > 0 && levels[0] === 1 &&
            !CHINESE_SECTION_PREFIX.test(headings[0].text.trim()) &&
            getArabicListNumber(headings[0].text) === null &&
            levels.slice(1, firstChapter).every((level) => level > 1)
        ) {
            // The answer title is shown by the sidebar's response row, not
            // repeated as a section in the semantic outline.
            levels[0] = 0;
        }

        arabicChapters.forEach((chapterIndex, position) => {
            levels[chapterIndex] = 1;
            const end = arabicChapters[position + 1] ?? headings.length;
            for (let index = chapterIndex + 1; index < end; index += 1) {
                const text = headings[index].text.trim();
                if (position === arabicChapters.length - 1 &&
                    levels[index] === 1 && TRAILING_TOP_LEVEL_PREFIX.test(text)) {
                    continue;
                }
                levels[index] = Math.max(2, levels[index]);
            }
        });
        return levels;
    }

    const chapterIndexes = headings
        .map((heading, index) => CHINESE_SECTION_PREFIX.test(heading.text.trim()) ? index : -1)
        .filter((index) => index >= 0);

    // One matching title may be ordinary prose. Without a Chinese chapter
    // outline, only infer top-level Arabic chapters when numbering starts at
    // the response's first heading and continues through at least three items.
    if (chapterIndexes.length < 2) {
        const numberedHeadings = headings
            .map((heading, index) => ({ index, number: getArabicListNumber(heading.text) }))
            .filter((entry): entry is { index: number; number: number } => entry.number !== null);
        const run: number[] = [];
        if (numberedHeadings[0]?.index === 0) {
            for (const { index, number } of numberedHeadings) {
                if (number !== run.length + 1) break;
                run.push(index);
            }
        }
        if (run.length >= 3) {
            run.forEach((index) => { levels[index] = 1; });
        }
        return levels;
    }

    chapterIndexes.forEach((chapterIndex) => {
        levels[chapterIndex] = 1;
    });

    chapterIndexes.forEach((chapterIndex, chapterPosition) => {
        const segmentEnd = chapterIndexes[chapterPosition + 1] ?? headings.length;
        let index = chapterIndex + 1;

        while (index < segmentEnd) {
            if (getArabicListNumber(headings[index].text) === null) {
                index += 1;
                continue;
            }

            const runStart = index;
            const numbers: number[] = [];
            while (index < segmentEnd) {
                const number = getArabicListNumber(headings[index].text);
                if (number === null) break;
                numbers.push(number);
                index += 1;
            }

            if (!isIncreasingNumberedRun(numbers)) continue;

            const intendedLevel = Math.max(2, levels[runStart]);
            for (let runIndex = runStart; runIndex < index; runIndex += 1) {
                levels[runIndex] = intendedLevel;
            }
        }
    });

    return levels;
};
