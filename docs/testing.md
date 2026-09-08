# テスト基盤

検索結果の基準はC/Migemo 1.8.0、コミット `e780fcf8dfe59fe3266ca8676906a3cefa1683e8`。jsmigemo 0.5.2はcompact辞書の変換と読取確認にだけ使う。検索コア・公開APIはまだ実装していない。

## 最初の実行

Node.js 26.0.0、npm 11.16.0、C11コンパイラ、CMake 3.21以上、tarを用意し、リポジトリルートで実行する。

    npm ci --ignore-scripts
    npm run reference:prepare
    npm run dictionary:prepare -- --fixture tiny
    npm test

`reference:prepare`だけがC/Migemoのソースアーカイブを取得する。SHA-256を検証してから展開・静的リンクし、`.cache/reference/`へテスト用ドライバとUTF-8変換表を置く。グローバルのcmigemoやシステム辞書は使わない。二回目以降は検証したアーカイブから再ビルドできる。キャッシュが壊れていれば失敗し、別の版には切り替えない。再取得する場合は `.cache/upstream/cmigemo.tar.gz` のみを削除してやり直す。

`npm test`は現在成立するテスト基盤の検証。15件のテスト内で107件の手書き入力と10,000件の重複しない生成入力、二種類の小辞書、比較器の故障検出を検証する。生成入力のシードは20260908。8クラスそれぞれ1,250件で、入力・比較用文字列を `tests/fixtures/generated.jsonl` に保存している。

## 各コマンドの意味

| コマンド | 検証対象 | 現在の状態 |
| --- | --- | --- |
| `npm test` | 固定データ、参照実装、意味比較と故障検出 | ローカルで成功 |
| `npm run test:coverage` | テスト補助コードの実行カバレッジ | 検索コアのカバレッジではない |
| `npm run test:moon` | MoonBitの文字列・バイト列プローブ、両出力先で各3件 | ローカルで成功 |
| `npm run test:bridge` | releaseビルドとNodeからのJS／Wasm GC呼出し、計4件 | ローカルで成功 |
| `npm run test:all` | 上の基盤・MoonBit・接続テスト | 記録したSDKが必要 |
| `npm run test:api` | 将来の公開APIの契約 | 本体未実装のため失敗する |
| `npm run test:compat -- --fixture tiny` | 本体のJS／Wasm GCとC/Migemoの意味比較 | 本体未実装のため失敗する |
| `npm run test:implementation` | API契約と互換性の両方 | M2以降の受け入れ用 |

GitHub ActionsはLinuxとmacOSで `npm test` と辞書の再生成一致を実行する構成。リモートのActions実行自体はまだ確認していない。MoonBit SDKの新規環境への復元が未解決のため、MoonBitのCIはM1の残項目。ブラウザの機能検出・auto切替・配布検証はM4/M6で追加する。

## 実装を接続する

`packages/mbmigemo/dist/index.js` が `createMigemo` をexportすると、公開APIテストと互換性テストがそのまま使える。未実装時の成功扱い、参照実装への代替、skipやtodoは入れていない。

M2でJSだけを試す場合:

    MBMIGEMO_BACKENDS=js npm run test:api
    npm run test:compat -- --fixture tiny --backend js --cases manual

別の場所にある試作を接続する場合:

    MBMIGEMO_MODULE=./path/to/index.mjs MBMIGEMO_BACKENDS=js npm run test:api
    npm run test:compat -- --module ./path/to/index.mjs --backend js

既定の互換性テストは両バックエンドで全10,107ケースを実行する。`cases`はケース数、`inputs`は重複を除いた入力数、`comparisons`は文書への照合回数。`patternDifferences`は表記だけの差も数える診断値で、意味の不一致数は `mismatches`。不一致があれば終了コード1になる。バックエンドが存在しない場合も失敗する。

不一致の入力・クラス・両パターン・長さ・不足/過剰に一致した文書を `test-results/compat.json` に保存する。`--report PATH`で変更できる。有限の文書集合に対する一致であり、全入力・全文書についての同値証明ではない。

公開API契約には、空入力 `(?!)`、同期query、UTF-16の保存、バイト列viewの範囲、初期化後の元配列変更、並行した二辞書インスタンス、入力の追加/削除、512候補の保持、辞書489バイトの全切断位置と12種類の形式破損を含む。形式破損は `InvalidDictionary` を要求する。SHA-256の検証は準備時の別契約であり、利用者が渡す全辞書に既知のチェックサムを要求しない。

## 参照実装とmbmigemo固有の契約

C/MigemoのC APIを使う理由は、CLIの対話入力が255バイトまでで、改行をレコード区切りとして扱うため。ドライバはUTF-8を16進数の行として送受信し、長い文字列・改行・空白を保持する。辞書本体と4種類の変換表は個別に読み込み、どれか一つでも読み込めなければ失敗する。

演算子は `| ( ) [ ]`、文字間の改行照合は無効。C APIのescape設定をJavaScript向けにし、literalの `\-` だけを `\x2d` へトークン単位で変換して `u` フラグでも有効にする。語彙や読み候補を変更する補正はしない。補正前・補正後のパターンは両方goldenに残す。

空文字列、NUL、単独サロゲートはC文字列の参照比較対象にしない。空入力は `(?!)`、NULと単独サロゲートは入力を失わず文字どおり扱うmbmigemoの契約で別にテストする。空白だけの入力は空入力へ変換せず、C/Migemoと比較する。

107件のgoldenでは参照自体の変動検知のためパターン文字列も一致を要求する。本体との比較は文書集合への一致で判定する。参照生成と本体呼出しは別モジュールになっており、同じ実装を自分自身と比較しない。

## データの更新

通常のテスト・辞書準備はgoldenやmanifestを書き換えない。元TSV、手書きケース、生成器、参照実装の版を意図して変えたときだけ実行する。

    npm run reference:prepare
    npm run fixtures:update -- --write
    npm test
    git diff -- tests/fixtures tests/reference

更新時はパターンだけでなく照合文書の増減、シード、辞書のSHA-256、参照コミット、変換表の出所を確認する。新しい失敗はまず手書きケースまたは入力列へ追加する。

実用辞書の準備・互換性はまだない。`--fixture all`を指定すると明示的に失敗する。現在の小辞書10,000入力の成功を、M3の実用辞書互換性達成とは扱わない。
