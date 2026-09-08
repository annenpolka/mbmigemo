import { createMigemo } from '/packages/mbmigemo/dist/index.js';

const documents = [
  { category: 'GUIDE / 01', title: '検索からはじまる読書', body: 'ローマ字で検索して、読みたい日本語の文書を見つける。けんさく・ケンサクも、そのまま扱えます。' },
  { category: 'LANGUAGE / 02', title: '日本語の小さなノート', body: 'ひらがな、カタカナ、漢字。日本語には、ひとつのことばを表すいくつもの書き方があります。' },
  { category: 'TRAVEL / 03', title: '東京から大阪へ', body: '東京駅を出発して、大阪の街を歩く。旅先で気になったことばを記録しました。' },
  { category: 'DAILY / 04', title: '学校帰りの寄り道', body: '学校からの帰り道、写真を撮ってから、お茶と抹茶のお菓子を買いました。' },
  { category: 'TEXT / 05', title: '文字をそのまま残す', body: '𠮷野、😀、が、が、ｶﾞ。記号 (a|b) や [x]、a.b も元の文章のまま表示します。' },
  { category: 'TEXT / 06', title: 'タグも、文章の一部', body: 'HTMLの記述例: <img src=x onerror=alert(1)>。記述例を画像として実行せず、文字として表示します。' },
];
const element = (id) => document.getElementById(id);
const query = element('query'), backend = element('backend');
let migemo, generation = 0;
let dictionaryPromise;

async function dictionary() {
  if (!dictionaryPromise) dictionaryPromise = (async () => {
    const config = await fetch('/demo-config.json').then((response) => {
      if (!response.ok) throw new Error(`設定の取得に失敗しました (HTTP ${response.status})`);
      return response.json();
    });
    const name = new URLSearchParams(location.search).get('dictionary') ?? config.dictionary;
    if (!['practical', 'tiny', 'alternate'].includes(name)) throw new Error('指定された辞書は利用できません。');
    const response = await fetch(`/dictionaries/${name}.compact`);
    if (!response.ok) throw new Error(`辞書の取得に失敗しました (HTTP ${response.status})。READMEの辞書準備手順を確認してください。`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    element('dictionary-name').textContent = `${name} · ${bytes.length.toLocaleString()} bytes`;
    element('dictionary-sha').textContent = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    return bytes;
  })();
  return dictionaryPromise;
}

function highlighted(text, pattern) {
  const fragment = document.createDocumentFragment();
  let offset = 0;
  for (const match of text.matchAll(new RegExp(pattern, 'gu'))) {
    if (match[0].length === 0) continue;
    fragment.append(document.createTextNode(text.slice(offset, match.index)));
    const mark = document.createElement('mark');
    mark.textContent = match[0];
    fragment.append(mark);
    offset = match.index + match[0].length;
  }
  fragment.append(document.createTextNode(text.slice(offset)));
  return fragment;
}

function search() {
  if (!migemo) return;
  const pattern = migemo.query(query.value);
  element('pattern').textContent = pattern;
  const expression = new RegExp(pattern, 'u');
  const matches = documents.filter((item) => expression.test(item.title) || expression.test(item.body));
  element('results').replaceChildren(...matches.map((item) => {
    const row = document.createElement('li');
    row.className = 'result';
    const category = document.createElement('span');
    category.className = 'category';
    category.textContent = item.category;
    const title = document.createElement('h3');
    title.append(highlighted(item.title, pattern));
    const body = document.createElement('p');
    body.append(highlighted(item.body, pattern));
    row.append(category, title, body);
    return row;
  }));
  element('count').textContent = `${matches.length} / ${documents.length} 件`;
  element('empty').hidden = matches.length !== 0;
  element('empty').textContent = query.value === ''
    ? 'ことばを入力すると、一致した文書がここに表示されます。'
    : '一致する文書はありません。別のことばを入力してください。';
}

async function initialize() {
  const current = ++generation;
  migemo = undefined;
  query.disabled = true;
  element('results').replaceChildren();
  element('count').textContent = '—';
  element('empty').hidden = true;
  element('error').hidden = true;
  element('pattern').textContent = '—';
  element('actual-backend').textContent = '—';
  element('status').textContent = '辞書を読み込んでいます…';
  try {
    const instance = await createMigemo({ dictionary: await dictionary(), backend: backend.value });
    if (current !== generation) return;
    migemo = instance;
    query.disabled = false;
    element('actual-backend').textContent = instance.backend;
    element('status').textContent = '準備できました。ブラウザ内で検索しています。';
    search();
  } catch (error) {
    if (current !== generation) return;
    element('status').textContent = '検索を開始できませんでした。';
    element('error').hidden = false;
    element('error').textContent = error.code === 'UnsupportedBackend'
      ? 'このブラウザは必要なWasm機能に対応していません。実行方式をJavaScriptまたは自動選択に切り替えてください。'
      : `${error.code ? `${error.code}: ` : ''}${error.message}`;
  }
}
query.addEventListener('input', search);
backend.addEventListener('change', initialize);
initialize();
