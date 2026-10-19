import assert from 'node:assert/strict';
import test from 'node:test';

import { inferChatGptOutlineLevels } from '../src/providers/chatgptHeadingLevels.ts';

test('repairs numbered Chinese chapters and inconsistent numbered children', () => {
    const headings = [
        { tagName: 'H2', text: '一、全文翻译' },
        { tagName: 'H3', text: '中秋月要到 9 月 27 日才真正圆' },
        { tagName: 'H1', text: '二、你可能不认识或不熟悉的单词' },
        { tagName: 'H3', text: '几个尤其值得记住的词' },
        { tagName: 'H4', text: '1. lunar' },
        { tagName: 'H4', text: '2. phase' },
        { tagName: 'H1', text: '三、你可能不熟悉的语法' },
        { tagName: 'H2', text: '1. will reach ... at ...' },
        { tagName: 'H1', text: '2. two calendar dates after ...' },
        { tagName: 'H1', text: '3. After all' },
        { tagName: 'H1', text: '四、最容易翻译错的句子' },
        { tagName: 'H2', text: '1. First sentence' },
        { tagName: 'H2', text: '2. Second sentence' },
    ];

    assert.deepEqual(inferChatGptOutlineLevels(headings), [
        1, 3,
        1, 3, 4, 4,
        1, 2, 2, 2,
        1, 2, 2,
    ]);
});

test('keeps ordinary heading levels literal without multiple chapter markers', () => {
    const headings = [
        { tagName: 'H2', text: '一、Only one numbered title' },
        { tagName: 'H1', text: '2. A separate heading' },
        { tagName: 'H3', text: 'Details' },
    ];

    assert.deepEqual(inferChatGptOutlineLevels(headings), [2, 1, 3]);
});

test('treats a numbered response with mixed h1 and h2 chapters as one level', () => {
    const headings = [
        { tagName: 'H2', text: '1. 形式化题意' },
        { tagName: 'H2', text: '2. 输入输出格式' },
        { tagName: 'H2', text: '3. 样例如何得到' },
        { tagName: 'H3', text: '询问 [2,6]' },
        { tagName: 'H1', text: '4. 解题思路' },
        { tagName: 'H2', text: '5. 一个询问如何转化' },
        { tagName: 'H3', text: '特殊情况' },
        { tagName: 'H1', text: '6. 代码' },
        { tagName: 'H1', text: '7. 正确性说明' },
        { tagName: 'H1', text: '8. 复杂度' },
        { tagName: 'H2', text: '9. 本题知识点' },
    ];

    assert.deepEqual(inferChatGptOutlineLevels(headings), [1, 1, 1, 3, 1, 1, 3, 1, 1, 1, 1]);
});

test('does not promote numbered subsections below a leading title', () => {
    const headings = [
        { tagName: 'H1', text: 'Overview' },
        { tagName: 'H2', text: '1. First part' },
        { tagName: 'H2', text: '2. Second part' },
        { tagName: 'H2', text: '3. Third part' },
    ];

    assert.deepEqual(inferChatGptOutlineLevels(headings), [1, 2, 2, 2]);
});

test('does not infer a top-level run from skipped or repeated numbers', () => {
    const headings = [
        { tagName: 'H2', text: '1. First part' },
        { tagName: 'H3', text: '1. Nested part' },
        { tagName: 'H2', text: '2. Second part' },
        { tagName: 'H1', text: '3. Separate part' },
    ];

    assert.deepEqual(inferChatGptOutlineLevels(headings), [2, 3, 2, 1]);
});

test('does not flatten a non-increasing numbered hierarchy', () => {
    const headings = [
        { tagName: 'H1', text: '一、Overview' },
        { tagName: 'H2', text: '1. Parent' },
        { tagName: 'H3', text: '1. Child' },
        { tagName: 'H3', text: '2. Child' },
        { tagName: 'H1', text: '二、Summary' },
    ];

    assert.deepEqual(inferChatGptOutlineLevels(headings), [1, 2, 3, 3, 1]);
});

test('keeps twelve numbered chapters above Chinese subsections in a titled answer', () => {
    const headings = [{ tagName: 'H1', text: '2026-10-19 Daily Knowledge Explorer｜每日领域知识' }];
    for (let chapter = 1; chapter <= 12; chapter += 1) {
        headings.push(
            { tagName: 'H1', text: `${chapter}. ${chapter === 1 ? '学校知识复习' : chapter === 2 ? '世界著名大学' : `主题 ${chapter}`}｜每日一课` },
            { tagName: 'H1', text: '一、主要概念' },
            { tagName: 'H3', text: '1. 细节' },
            { tagName: 'H1', text: '2. 编号子项' },
            { tagName: 'H1', text: '二、延伸阅读' },
        );
    }
    headings.push({ tagName: 'H1', text: '今日学习进度总结' });

    const levels = inferChatGptOutlineLevels(headings);
    assert.equal(levels[0], 0);
    assert.deepEqual(levels.filter((level) => level === 1).length, 13);
    assert.deepEqual(levels.slice(1, 6), [1, 2, 3, 2, 2]);
    assert.equal(levels.at(-1), 1);
});

test('does not treat nested numbered sections below a leading title as chapters', () => {
    const headings = [
        { tagName: 'H1', text: 'Overview' },
        { tagName: 'H2', text: '1. Part one' },
        { tagName: 'H3', text: '1. Detail' },
        { tagName: 'H2', text: '2. Part two' },
        { tagName: 'H2', text: '3. Part three' },
    ];
    assert.deepEqual(inferChatGptOutlineLevels(headings), [1, 2, 3, 2, 2]);
});

test('finds the chapter sequence when one chapter has no title separator', () => {
    const headings = [
        { tagName: 'H1', text: 'Daily Knowledge Explorer｜每日领域知识' },
        { tagName: 'H1', text: '1. 学校知识复习｜信息技术' },
        { tagName: 'H1', text: '一、字符编码' },
        { tagName: 'H1', text: '2. 世界著名大学｜浙江大学' },
        { tagName: 'H3', text: '1. 竺可桢' },
        { tagName: 'H3', text: '2. 苏步青' },
        { tagName: 'H1', text: '3. 世界国家与城市｜捷克' },
        { tagName: 'H1', text: '4. 中国城市｜长沙' },
        { tagName: 'H1', text: '5. 汽车品牌与车标｜Mercedes-Benz' },
        { tagName: 'H1', text: '6. 历史知识' },
        { tagName: 'H1', text: '一、历史背景' },
        { tagName: 'H1', text: '7. 语文知识｜杜甫' },
        { tagName: 'H1', text: '今日学习进度总结' },
    ];

    assert.deepEqual(inferChatGptOutlineLevels(headings), [
        0, 1, 2, 1, 3, 3, 1, 1, 1, 1, 2, 1, 1,
    ]);
});
