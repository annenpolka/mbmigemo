# mbmigemo

MoonBitで実装する、ブラウザ向けのMigemoライブラリ。

`kensaku` から「検索」「けんさく」「ケンサク」などに一致する正規表現を生成する。ローマ字変換・compact辞書の探索・正規表現生成は共通のMoonBitコアで行い、JavaScriptとWasm GCへ出力する。

現在は**小辞書の検索コアと公開APIを実装済み**。Node.jsで両バックエンドを検証している。実用辞書、ブラウザでの検証、性能測定は後続の段階。進捗と残項目は[PLAN.md](PLAN.md)に記録する。

## ビルドして検索する

Node.js 26.0.0、npm 11.16.0、tarを用意する。SDKの自動復元はmacOS ARM64とLinux x64に対応し、システムのMoonBitを変更しない。

```sh
npm ci --ignore-scripts
npm run toolchain:prepare
npm run build
node --input-type=module <<'JS'
import { readFile } from 'node:fs/promises';
import { createMigemo } from './packages/mbmigemo/dist/index.js';

const dictionary = new Uint8Array(await readFile('tests/fixtures/tiny.compact'));
const migemo = await createMigemo({ dictionary });
console.log(migemo.backend); // js
console.log(new RegExp(migemo.query('kensaku'), 'u').test('検索')); // true
JS
```

`createMigemo` はPromiseを返し、初期化後の `query` は同期的にパターン文字列を返す。辞書取得と `RegExp` による照合は呼び出し側で行う。辞書バイト列は初期化時に取り込み、元の配列を変更しても検索内容は変わらない。

`backend` は `js`（既定）、`wasm-gc`、`auto`。`auto` はWasm GCとJS String Builtinsが使える場合にWasm版を選び、機能未対応時にJSへ移る。辞書破損や読み込み失敗は `InvalidDictionary`、`InitializationFailed`、明示したWasmの未対応は `UnsupportedBackend` の `error.code` で判別できる。

空入力は常に不一致の `(?!)`。空白、NUL、単独サロゲートを勝手に除去・正規化しない。候補数に上限を設けず、C/Migemoと同様に語ごとに既存の候補で始まる長い候補をまとめてから連結する。

## 検証

C11コンパイラとCMake 3.21以上も用意する。

```sh
npm run reference:prepare
npm run test:all
```

C/Migemo 1.8.0の固定コミットと、同じ語彙の小辞書で検索結果を比較する。107手書きケース＋10,000生成ケースに加え、変換表の各キー・入力途中・連結語について生成された有限な正規表現の候補を列挙して検証する。jsmigemo 0.5.2は開発時の辞書変換と読取確認に使い、製品の検索処理には依存しない。

fast-checkのPBTは生成辞書、辞書破損、UTF-16、二インスタンスの編集履歴などを検証し、失敗時の反例を縮小してseed/pathを保存する。詳細は[テスト手順](docs/testing.md)、[ツールチェーン](docs/toolchain.md)、[辞書形式](docs/dictionary-format.md)、[上流とライセンス](docs/upstream.md)を参照。

プロジェクト全体のライセンスは未決定。C/Migemo由来の変換表と処理、MoonBit標準ライブラリのライセンス・NOTICEは配布用ビルドへ含める。辞書は本体へ埋め込まない。
