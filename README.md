# mbmigemo

MoonBitで実装する、ブラウザ向けのMigemoライブラリ。

`kensaku` から「検索」「けんさく」「ケンサク」などに一致する正規表現を生成する。ローマ字変換・compact辞書の探索・正規表現生成は共通のMoonBitコアで行い、JavaScriptとWasm GCへ出力する。

**共通検索コア、公開API、実用辞書、ブラウザデモを実装済み**。JSとWasm GCをC/Migemoと比較し、Chromium・Firefox・WebKitとSafari実機で検索を確認している。実測に基づき既定はJS、Wasm GCは明示選択できる実験版とする。進捗と測定・配布確認は[PLAN.md](PLAN.md)に記録する。

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

## 実用辞書とブラウザ

```sh
npm run dictionary:prepare -- --fixture all
npm run browser:prepare
npm run test:release
npm run demo
```

`http://127.0.0.1:4173`で、入力に一致する日本語の文書と強調表示を確認できる。ポートを変える場合は`npm run demo -- --port 4175`。実行方式を切り替え、開発用の確認情報で辞書のSHA-256と実際のバックエンドを確認できる。ブラウザで利用する場合も、配布物の`dist/`を相対位置を保って配置し、辞書を別途fetchして`createMigemo`へ渡す。

実用辞書は固定したSKK-JISYO.Lから生成する163,556読み・224,044候補、2,135,633バイト。同じ語彙をC/Migemoへ渡し、各バックエンドで12,107ケース・1,471,006文書照合の差分0を確認した。これは有限のテストでの一致であり、全入力の同値証明ではない。

`npm run size`で圧縮別の容量、`npm run bench`で3ブラウザ各3回の起動・検索・取得可能なメモリを測る。[測定手法](docs/benchmarks/methodology.md)に比較条件と採用基準を固定している。

M4 Maxでの[実測結果](docs/benchmarks/baseline.md)では、コードのBrotli合計がJS 15,844バイト、Wasm GC 16,804バイト。Wasm GCはChromiumの問い合わせp95で約23〜28%速い一方、初回応答は約2倍となり、既定変更の条件を満たさなかった。辞書は両版共通でBrotli 1,249,022バイト。`auto`は対応機能で選択するため、最速の方式を推測する機能ではない。

`npm run pack:check`はnpm packした成果物を別のTypeScriptプロジェクトへ導入し、小辞書と実用辞書を検証する。npmへの公開は行わない。

JS版はES modulesとUnicode対応の`RegExp`を使う。Wasm版にはWasm GCとJS String Builtinsの両方が必要。確認したブラウザの版と、自動テスト・Safari実機確認の範囲は[テスト手順](docs/testing.md)を参照。`query`と照合は同期処理のため、大きな展開や大量の文書を扱うアプリはWorkerなどで実行場所を分けられる。

プロジェクトのライセンスはMIT（[LICENSE](LICENSE)）。C/Migemo由来の変換表と処理、MoonBit標準ライブラリのライセンス・NOTICEは配布用ビルドへ含める。実用辞書のGPL-2.0-or-laterの条件は[上流とライセンス](docs/upstream.md)に記録し、元データ・変換結果・除外理由をキャッシュに保存する。辞書はパッケージ本体へ埋め込まない。
