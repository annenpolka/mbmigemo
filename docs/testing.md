# テスト基盤

検索結果の基準はC/Migemo 1.8.0、コミット `e780fcf8dfe59fe3266ca8676906a3cefa1683e8`。jsmigemo 0.5.2はcompact辞書の変換と読取確認にだけ使う。検索コア・公開APIはまだ実装していない。

## 最初の実行

Node.js 26.0.0、npm 11.16.0、C11コンパイラ、CMake 3.21以上、tarを用意し、リポジトリルートで実行する。

    npm ci --ignore-scripts
    npm run reference:prepare
    npm run dictionary:prepare -- --fixture tiny
    npm test

`reference:prepare`だけがC/Migemoのソースアーカイブを取得する。SHA-256を検証してから展開・静的リンクし、`.cache/reference/`へテスト用ドライバとUTF-8変換表を置く。グローバルのcmigemoやシステム辞書は使わない。二回目以降は検証したアーカイブから再ビルドできる。キャッシュが壊れていれば失敗し、別の版には切り替えない。再取得する場合は `.cache/upstream/cmigemo.tar.gz` のみを削除してやり直す。

`npm test`は現在成立するテスト基盤の検証。18件の固定テストと6種類のPBTで、107件の手書き入力と10,000件の保存済み生成入力、小辞書、比較器の故障検出を検証する。保存済み生成入力のシードは20260908。8クラスそれぞれ1,250件で、入力・比較用文字列を `tests/fixtures/generated.jsonl` に保存している。PBTの生成と縮小はこれとは独立して行う。

## 各コマンドの意味

| コマンド | 検証対象 | 現在の状態 |
| --- | --- | --- |
| `npm test` | 固定データ、参照実装、意味比較とPBT | ローカルで成功 |
| `npm run test:pbt` | 辞書・比較器・C参照の6プロパティ、各500試行 | ローカルで成功 |
| `npm run test:pbt:stress` | 同じ6プロパティを各5,000試行 | seedは環境変数で変更できる |
| `npm run test:coverage` | テスト補助コードの実行カバレッジ | 検索コアのカバレッジではない |
| `npm run test:moon` | MoonBitの文字列・バイト列プローブ、両出力先で各3件 | ローカルで成功 |
| `npm run test:bridge` | releaseビルドと両バックエンドの固定4件＋PBT2種類 | ローカルで成功 |
| `npm run test:pbt:bridge` | 両バックエンドの文字列・バイト列PBTだけ | ローカルで成功 |
| `npm run test:all` | 上の基盤・MoonBit・接続テスト | 記録したSDKが必要 |
| `npm run test:api` | 将来の公開APIの契約 | 本体未実装のため失敗する |
| `npm run test:pbt:api` | 生成辞書・切断・編集履歴のAPI用PBT | 本体未実装のため失敗する |
| `npm run test:compat -- --fixture tiny` | 本体のJS／Wasm GCとC/Migemoの意味比較 | 本体未実装のため失敗する |
| `npm run test:implementation` | API契約と互換性の両方 | M2以降の受け入れ用 |

GitHub ActionsはLinux/macOS × PBT seed 20260908/104729の4構成で `npm test` と辞書の再生成一致を実行し、PBTの記録をartifactへ保存する。2026-09-08にコミット `1a92c08` の[Actions実行](https://github.com/annenpolka/mbmigemo/actions/runs/34182583661)で4構成すべての成功を確認した。MoonBit SDKの新規環境への復元が未解決のため、MoonBitのCIはM1の残項目。ブラウザの機能検出・auto切替・配布検証はM4/M6で追加する。

ローカルではキャッシュ・node_modules・ビルド結果を含めず別ディレクトリへコピーし、npm ci、C参照の新規取得・ビルド、辞書再生成、test:allまで成功した。MoonBitについては同じマシンの既存SDKを利用しており、SDKの新規導入を検証したものではない。

## PBTの性質と再現

fast-check 4.9.0を完全な版番号で固定し、PRNGはxoroshiro128plusを使う。既定はseed 20260908、各500試行。生成器も版とともに固定し、失敗は入力の配列・文字列・バイト列・操作列を自動で縮小する。縮小結果は必ずしも全候補中の最小とは限らない。

| プロパティ名 | 不変条件と独立した期待値 |
| --- | --- |
| `dictionary-prefix-model` | ランダムなTSV辞書のexact lookupと前方一致がMapとstartsWithによるモデルに一致する |
| `dictionary-row-order` | 読みの行順を変えてもバイナリが同じ。候補順を変えてもlookupの集合が同じ |
| `dictionary-invalid-reading` | 非対応の読みを含む辞書は候補を黙って落とさず失敗する |
| `regex-match-set-model` | 正規表現の不足・過剰一致の検出が、文字列includesによるモデルに一致する |
| `regex-candidate-loss` | 区別できる候補を一つ取り除けば必ず検出できる |
| `reference-literal-and-history` | C参照のパターンが元入力に一致し、別の入力を挟んでも結果が変わらない |
| `bridge-utf16` | 任意のUTF-16列が両バックエンドを往復しても変わらない |
| `bridge-byte-ownership` | 任意のbyte viewの内容・長さ・チェックサムが両バックエンドで一致し、元配列の変更や追加確保で変わらない |

接続PBTは0/31/32/33/63/64/65/127/128/129/255/256/257/1024/4096などの長さへ生成を偏らせ、NUL、単独サロゲート、結合文字も明示的に生成する。辞書の検証はテスト用のjsmigemo readerに対するもの。本体の辞書実装が正しいことは、後続のAPI用PBTで別に検証する。

API用PBTは各バックエンドに `api-js-dictionary-candidates`、`api-js-truncation`、`api-js-edit-history` を用意する（Wasm側は `api-wasm-gc-...`）。生成辞書の全候補を保持すること、生成辞書の任意の切断を拒否すること、二インスタンスの入力の追加・削除・置換・クリアをC参照の期待値と比較する。操作列は単純な配列として生成するため、seed/pathだけで縮小した履歴を再現できる。

結果は `test-results/pbt/<property>.json` に保存する。失敗時にはseed、path、試行数、縮小回数、縮小した反例、原因を含む。同じプロパティが成功すれば成功記録で上書きし、古い失敗を残さない。固定のテスト内で意図的に最後のバイトを落とす処理を動かし、反例が1バイトまで縮小され、同じseed/pathで再現できることも検証する。

実行例:

    npm run test:pbt
    PBT_SEED=104729 npm run test:pbt:stress
    PBT_PROPERTY=dictionary-prefix-model PBT_SEED=20260908 PBT_RUNS=1000 npm run test:pbt

失敗ログが示したpathで一つのプロパティを再実行する:

    PBT_PROPERTY=dictionary-prefix-model PBT_SEED=20260908 PBT_PATH='<ログのpath>' npm run test:pbt

接続PBTの再実行には `npm run test:pbt:bridge`、API用には `npm run test:pbt:api` を使う。pathを指定するときはプロパティ名とseedも必須。未知の名前や試行数0は成功扱いにしない。実用辞書や全入力についての完全性をPBTの成功だけで主張しない。

## PBTで発見した既知の上流不具合

初回のseed 20260908で、jsmigemo 0.5.2の対応ビット列が64ビット境界で終わると最後の候補が消えるケースを検出した。185回の縮小で得た7項目の辞書と再現情報を `tests/fixtures/regressions/compact-mapping-boundary.json` に残した。

Unicode値の問題、builderの破損、readerの終端処理を切り分け、ASCIIだけの1読み・62候補でも再現した。mappingの長さ64/128/192ではnextClearBitが-1を返し、63/65では論理終端を返す。バイト列の候補index自体はすべて存在していた。readerで見つからない終端を論理ビット数として扱うと、62/126/190候補すべてが復元した。

補正は `scripts/lib/dictionary.mjs` の `readCompactDictionary` に限定する。上流ソースやbuilderの出力バイト列は変更しない。C/Migemoの検索参照にも変更はない。元の縮小例と64/128/192境界を固定テストに加え、PBTの生成範囲は狭めていない。

[fast-checkの公式説明](https://fast-check.dev/docs/introduction/what-is-property-based-testing/)と[再現用パラメータ](https://fast-check.dev/docs/api/interfaces/Parameters/)を参考に、実際の縮小・再実行を確認した。

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
