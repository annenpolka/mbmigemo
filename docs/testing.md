# テスト基盤

検索結果の基準はC/Migemo 1.8.0、コミット `e780fcf8dfe59fe3266ca8676906a3cefa1683e8`。jsmigemo 0.5.2はcompact辞書の変換と読取確認にだけ使う。検索コアと公開API、小辞書・実用辞書、ブラウザdemo、配布物とベンチマークの検証を用意している。既定のバックエンドはJSで、Wasm GCは明示選択または `auto` で利用できる。

## 最初の実行

Node.js 26.0.0、npm 11.16.0、C11コンパイラ、CMake 3.21以上、tarを用意し、リポジトリルートで実行する。

    npm ci --ignore-scripts
    npm run reference:prepare
    npm run dictionary:prepare -- --fixture all
    npm run toolchain:prepare
    npm run browser:prepare
    npm run test:release

Linuxでブラウザのシステム依存も導入する場合は、`PLAYWRIGHT_BROWSERS_PATH=.cache/ms-playwright npx playwright install --with-deps chromium firefox webkit` を使う。小辞書だけのコア開発なら辞書準備を `--fixture tiny` にし、ブラウザ準備を省いて `npm run test:all` を実行できる。`test:release` は実用辞書とブラウザを必須とし、未準備の対象をskipしない。

`reference:prepare`だけがC/Migemoのソースアーカイブを取得する。SHA-256を検証してから展開・静的リンクし、`.cache/reference/`へテスト用ドライバとUTF-8変換表を置く。グローバルのcmigemoやシステム辞書は使わない。二回目以降は検証したアーカイブから再ビルドできる。キャッシュが壊れていれば失敗し、別の版には切り替えない。再取得する場合は `.cache/upstream/cmigemo.tar.gz` のみを削除してやり直す。

`npm test`はテスト基盤の検証。23件の固定テストと6種類のPBTで、107件の手書き入力と10,000件の保存済み生成入力、小辞書、実用辞書変換規則、サーバーの入力処理、比較器の故障検出を検証する。保存済み生成入力のシードは20260908。8クラスそれぞれ1,250件で、入力・比較用文字列を `tests/fixtures/generated.jsonl` に保存している。PBTの生成と縮小はこれとは独立して行う。

## 各コマンドの意味

| コマンド | 検証対象 | 前提・範囲 |
| --- | --- | --- |
| `npm test` | 固定データ、参照実装、意味比較とPBT | 固定C参照が必要 |
| `npm run test:pbt` | 辞書・比較器・C参照の6プロパティ、各500試行 | 固定C参照が必要 |
| `npm run test:pbt:stress` | 同じ6プロパティを各5,000試行 | seedは環境変数で変更できる |
| `npm run test:coverage` | テスト補助コードの実行カバレッジ | 検索コアのカバレッジではない |
| `npm run test:moon` | 検索コアと接続プローブ、両出力先で各27件 | 復元済みSDKが必要 |
| `npm run test:bridge` | releaseビルドと両バックエンドの固定4件＋PBT2種類 | 復元済みSDKが必要 |
| `npm run test:pbt:bridge` | 両バックエンドの文字列・バイト列PBTだけ | 復元済みSDKが必要 |
| `npm run test:all` | 基盤・変換表整合性・MoonBit・接続・ビルド・API・互換性 | 復元済みSDKが必要 |
| `npm run test:api` | 公開API、PBT、変換候補列挙、エラー／遅延ロード | ビルド後に実行 |
| `npm run test:pbt:api` | UTF-16・生成辞書・切断・編集履歴のAPI用PBT | ビルド後に実行 |
| `npm run test:compat -- --fixture tiny` | 本体のJS／Wasm GCとC/Migemoの意味比較 | ビルド後に実行 |
| `npm run test:compat:all` | 小辞書と実用辞書を両バックエンドでC/Migemoと比較 | ビルド・両辞書・固定C参照が必要 |
| `npm run test:implementation` | ビルド、API契約と小辞書の互換性 | 実用辞書・ブラウザは含まない |
| `npm run test:pbt:dictionary` | 任意バイト列・辞書変異のPBT | 各500試行 |
| `npm run test:practical` | 実用辞書のJIT回帰と、小辞書・実用辞書の全比較 | 実装済みの両バックエンドを必須とする |
| `npm run test:browser` | Chromium・Firefox・WebKitのAPI／画面48件 | ビルド・実用辞書・ブラウザが必要 |
| `npm run test:bench` | 計測の採用基準と互換性結果の出所確認、8件 | 速度測定そのものは行わない |
| `npm run pack:check` | ビルド後のnpm packを別のTypeScriptプロジェクトから利用 | 両辞書、JS／Wasm GC／auto。npmへの送信なし |
| `npm run test:release` | test:all、bench判定、実用辞書、ブラウザ、両辞書のpack確認 | 準備後の一括受け入れ |

GitHub Actionsの現定義は6ジョブ。Linux/macOS × PBT seed 20260908/104729の4構成で固定C参照とMoonBit SDKを復元し、`test:all`、辞書再生成の一致、小辞書のpackを検証する。追加のLinux/macOS各1構成で実用辞書、3ブラウザ、benchの判定テスト、両辞書のpackを検証する。PBT、互換性、browser trace、packの記録をartifactへ保存する。性能の採用判断は共有CIランナーで測らず、環境を記録した別の計測で行う。

2026-09-08に実装コミット `1215a72` の[6構成のActions実行](https://github.com/annenpolka/mbmigemo/actions/runs/34187248404)で全ジョブの成功を確認した。実用辞書の新規取得・変換、両版の全互換性、各OSの48ブラウザテスト、独立TypeScriptプロジェクトでのpack利用も含む。先行するM2の[旧4構成の実行](https://github.com/annenpolka/mbmigemo/actions/runs/34184453471)とは検証範囲を区別する。

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

接続PBTは0/31/32/33/63/64/65/127/128/129/255/256/257/1024/4096などの長さへ生成を偏らせ、NUL、単独サロゲート、結合文字も明示的に生成する。辞書の検証はテスト用のjsmigemo readerに対するもの。本体の辞書実装はAPIの生成辞書・切断・変異PBTで別に検証する。

API用PBTは各バックエンドに `api-js-utf16-literal`、`api-js-dictionary-candidates`、`api-js-truncation`、`api-js-edit-history` を用意する（Wasm側は `api-wasm-gc-...`）。任意のUTF-16入力に対する文字どおりの一致と空文書への不一致、生成辞書の全候補の保持、生成辞書の任意の切断の拒否、二インスタンスの入力の追加・削除・置換・クリアを検証する。編集履歴はC参照と比較する。操作列は単純な配列として生成するため、seed/pathだけで縮小した履歴を再現できる。

`api-dictionary-arbitrary-bytes` と `api-dictionary-byte-mutations` は、任意のバイト列・正常な辞書に変更を加えたバイト列について、両バックエンドが同じ判定をすること、拒否が `InvalidDictionary` になること、受理後のパターンが一致し `/u` でコンパイルできることを検証する。変更しても形式上正常な辞書はあり得るため、すべての変更を拒否するとは要求しない。

結果は `test-results/pbt/<property>.json` に保存する。失敗時にはseed、path、試行数、縮小回数、縮小した反例、原因を含む。同じプロパティが成功すれば成功記録で上書きし、古い失敗を残さない。固定のテスト内で意図的に最後のバイトを落とす処理を動かし、反例が1バイトまで縮小され、同じseed/pathで再現できることも検証する。

実行例:

    npm run test:pbt
    PBT_SEED=104729 npm run test:pbt:stress
    PBT_PROPERTY=dictionary-prefix-model PBT_SEED=20260908 PBT_RUNS=1000 npm run test:pbt

失敗ログが示したpathで一つのプロパティを再実行する:

    PBT_PROPERTY=dictionary-prefix-model PBT_SEED=20260908 PBT_PATH='<ログのpath>' npm run test:pbt

接続PBTの再実行には `npm run test:pbt:bridge`、API用には `npm run test:pbt:api`、辞書変異用には `npm run test:pbt:dictionary` を使う。pathを指定するときはプロパティ名とseedも必須。未知の名前や試行数0は成功扱いにしない。実用辞書や全入力についての完全性をPBTの成功だけで主張しない。

## PBTで発見した既知の上流不具合

初回のseed 20260908で、jsmigemo 0.5.2の対応ビット列が64ビット境界で終わると最後の候補が消えるケースを検出した。185回の縮小で得た7項目の辞書と再現情報を `tests/fixtures/regressions/compact-mapping-boundary.json` に残した。

Unicode値の問題、builderの破損、readerの終端処理を切り分け、ASCIIだけの1読み・62候補でも再現した。mappingの長さ64/128/192ではnextClearBitが-1を返し、63/65では論理終端を返す。バイト列の候補index自体はすべて存在していた。readerで見つからない終端を論理ビット数として扱うと、62/126/190候補すべてが復元した。

補正は `scripts/lib/dictionary.mjs` の `readCompactDictionary` に限定する。上流ソースやbuilderの出力バイト列は変更しない。C/Migemoの検索参照にも変更はない。元の縮小例と64/128/192境界を固定テストに加え、PBTの生成範囲は狭めていない。

[fast-checkの公式説明](https://fast-check.dev/docs/introduction/what-is-property-based-testing/)と[再現用パラメータ](https://fast-check.dev/docs/api/interfaces/Parameters/)を参考に、実際の縮小・再実行を確認した。

## 実装の互換性を確認する

`npm run build` が `packages/mbmigemo/dist/index.js` と型定義・両コアを作る。テストは実装を直接呼び、参照実装への代替、skipやtodoは入れていない。

コア契約と比較をJSだけに絞る場合（バックエンド選択のテストは両版の配布物を使う）:

    MBMIGEMO_BACKENDS=js npm run test:api
    npm run test:compat -- --fixture tiny --backend js --cases manual

別の場所にある試作を比較する場合:

    npm run test:compat -- --module ./path/to/index.mjs --backend js

既定の互換性テストは両バックエンドで全10,107ケースを実行する。`cases`はケース数、`inputs`は重複を除いた入力数、`comparisons`は文書への照合回数。`patternDifferences`は表記だけの差も数える診断値で、意味の不一致数は `mismatches`。不一致があれば終了コード1になる。バックエンドが存在しない場合も失敗する。

不一致の入力・クラス・両パターン・長さ・不足/過剰に一致した文書を、通常の`test:compat`は`test-results/compat.json`、`test:practical`／`test:compat:all`は`test-results/compat-practical.json`に保存する。失敗検出用のCLIテストは一時ディレクトリを使い、実装の記録を上書きしない。`--report PATH`で変更できる。有限の文書集合に対する一致であり、全入力・全文書についての同値証明ではない。

公開API契約には、空入力 `(?!)`、同期query、UTF-16の保存、バイト列viewの範囲、初期化後の元配列変更、並行した二辞書インスタンス、入力の追加/削除、512候補の保持、辞書489バイトの全切断位置と12種類の形式破損を含む。形式破損は `InvalidDictionary` を要求する。SHA-256の検証は準備時の別契約であり、利用者が渡す全辞書に既知のチェックサムを要求しない。


追加の `romaji-oracle.test.mjs` は、変換表から作った1,781入力についてC/Migemoと本体の有限な正規表現を列挙し、相互に全候補を照合する。固定文書に現れない候補も検証でき、現在は各バックエンドで68,576候補の照合が成功している。列挙器は未対応の正規表現構文を拒否し、候補の欠落・追加を検出する自己テストを持つ。

このテストで、`KensakuNihongo` が誤って `検索機Nihongo` に一致する不具合を発見した。C/Migemoは句ごとに「検索」があれば「検索機」を除いてから次の句と連結する。単一の句では冗長な候補でも、連結後の意味は変わる。実装はUnicodeの文字境界を守って同じ処理を行う。表記の短縮や速度のための候補上限とは区別する。

辞書リーダーは正規の54バイトの空辞書も受け入れ、ローマ字変換を利用できる。破損を空辞書へ置き換える処理はない。辞書に意図的に空の候補が登録されている場合、その読みは空文字列にも一致する。空の問い合わせ自体は常に `(?!)` の契約を優先する。

## 実用辞書と正規表現JITの回帰

`--fixture practical` は固定したSKK-JISYO.Lから作る辞書、`--fixture all` は小辞書と実用辞書を意味する。

    npm run dictionary:prepare -- --fixture all
    npm run build
    npm run test:practical

実用辞書の元データ・版・チェックサムは `tests/dictionaries/practical.lock.json` に固定する。変換後は163,556の読み、224,044候補、2,135,633バイト。SHA-256は `8fa973194468b4cc37e713e0c26c4a08625ee850d5c5db8497eb409d1263bc21`。C参照とmbmigemoは同じ変換後TSVの語彙を使う。元SKKのすべての構文を検索語として受理するものではなく、注釈・送り仮名・特殊キー等の変換規則と除外記録は[上流資料と辞書の扱い](upstream.md)を参照する。ソース、変換TSV、compact、除外記録、ライセンス、receiptは `.cache/dictionaries/practical/` に置き、npmパッケージへ辞書を埋め込まない。

実用辞書の全比較には共通の10,107ケースと、固定seedで辞書から抽出した読み・接頭辞の2,000ケースを使う。各バックエンドで12,107ケース、11,707の重複なし入力、1,471,006回の文書照合を実行する。生成した追加入力は `.cache/dictionaries/practical/compat-cases.jsonl` に保存する。比較記録はコアartifact・辞書・元TSV・入力・文書のハッシュとC参照の版を含み、別ビルドの成功記録を性能測定に流用できない。

2026-09-08に、この全比較がJS・Wasm GCの双方で差分0となることを確認した。有限の入力と文書集合についての結果であり、未知の全入力を含む同値証明ではない。

この全比較で、大小文字の混在した `ToUKYoUGaKKoUtouKyoU` と `ShASHiNnIhOngOkensaku` がV8の正規表現JITに数秒を要する問題を発見した。選択肢を平坦に連結する出力を、Unicodeコードポイント単位で共通接頭辞と文字クラスを共有するtrie出力へ変更した。候補数を切り詰めず、C参照のprefix shadowと孤立surrogateの意味を維持する。長い一子枝は平坦に出力し、生成処理は明示スタックを使う。

`tests/practical/cases.json` の2入力と `KaKaKaKaKa` を回帰ケースとして固定する。各入力・各バックエンドを別プロセスで実行し、実際の `RegExp.test()` まで含めてC参照との一致を検証する。同期JIT中は同じプロセス内のタイマーで中断できないため、親プロセスが15秒の上限を持つ。この上限は停止の検知用で、性能の目標値ではない。constructorだけの計測では遅延コンパイルを見逃す。

## ブラウザとdemo

    npm run browser:prepare
    npm run test:browser
    npm run demo

demoは既定で `http://127.0.0.1:4173`、自動テストは4174を使用する。使用中のポートを止めず、demoは `npm run demo -- --port 4175`、自動テストは `MBMIGEMO_TEST_PORT=4176 npm run test:browser` で変更できる。Playwrightは既存サーバーを流用しない。共有サーバーはdemo・bench・公開コア・指定辞書のルートだけを公開し、`.git` や任意のリポジトリファイルを配信しない。

demoは実用辞書を既定とし、辞書がなければ取得エラーを表示する。小辞書を使う場合は `?dictionary=tiny` を明示する。入力するたびに元の文書を検索し、一致箇所はテキストノードと `mark` で表示する。入力を消すと0件になり、字形の正規化やHTMLとしての挿入は行わない。辞書SHA-256、実際のbackend、生成パターンは「開発用の確認情報」で確認できる。検索のたびに通信する処理はない。

2026-09-08のローカル確認では48テストが全成功（14.9秒）。各エンジン16件で、JS強制、Wasm GC強制、native機能判定、機能を無効にした `auto`、必要なartifactだけの遅延ロード、破損辞書・破損コア・取得失敗・runtime trapの非フォールバック、Wasm取得の再試行、同時初期化と入力履歴、107手書きケースのC参照比較、実用辞書UIと安全なハイライト、狭い画面、遅い初期化後の選択変更を検証した。

| 実行環境 | 確認した版 | 確認範囲 |
| --- | --- | --- |
| Playwright Chromium | 153.0.8010.12 | 16件成功。Wasm GCとJS String Builtinsの実プローブ成功 |
| Playwright Firefox | 155.0 | 同上 |
| Playwright WebKit | 26.6 | 同上。Safari実機とは別の検証対象 |
| Safari実機 | 26.6.2（21624.5.1.11.3） | 手動UIでJSのkensakuが1/6件、Wasm GCのnihongoが2/6件、autoの実backendがwasm-gc、クリア後0/6件と `(?!)` を確認 |

Safari実機はRemote Automationが無効のため、WebDriverの自動検証ではなく画面操作で確認した。これはWasm未対応という意味ではない。Safari実機でPlaywrightの48件全体や性能測定まで実行したとは扱わない。自動結果と機能判定の記録は `test-results/browser/results.json`、失敗時のtrace・画像は `test-results/browser/artifacts/` に保存する。

## 配布物と性能測定

    npm run pack:check
    npm run test:bench
    npm run size -- --fixture practical
    npm run bench -- --fixture practical --runs 3

`pack:check` はビルドしてからtarballを作り、一時ディレクトリのTypeScript利用プロジェクトへoffline installする。型定義、両コア、feature probe、ライセンス類の同梱を確認し、小辞書・実用辞書それぞれでJS／Wasm GC／autoの検索、空入力、元配列の変更、不正辞書のエラーを実行する。記録は `test-results/pack.json`、tarballは `.cache/pack/` に置く。npmへの公開や名前の確保はしない。小辞書だけを検証する場合はビルド後に `node scripts/pack-check.mjs --fixture tiny` を使う。

`test:bench` の8件は採用基準と互換性記録の出所を検証する固定テストで、実機の速度測定とは別。`size` はコード・接続JSと辞書のraw/gzip/Brotliバイト数を分けて保存する。`bench` は同じ辞書とワークロードを各ブラウザ・各backendの新規プロセスで順番に測り、起動、展開、RegExp構築、照合、取得可能なメモリ観測を記録する。測定中はビルドや重いテストを同時実行しない。

実用辞書の計測開始には `npm run test:practical` の完了済みpassing記録（`test-results/compat-practical.json`）が必要で、現在のartifact・辞書・入力・文書・C参照との一致を検査する。`--compat-report` で記録の場所を指定できる。`--fixture tiny --runs 1 --warmup 1 --rounds 1` はハーネスのsmoke確認に限り、採用判断には使わない。計測値の読み方、未対応・欠測の扱い、3回の採用条件と出力先は[ベンチマークの手法](benchmarks/methodology.md)を参照する。コマンドの実装やテスト成功だけで性能目標を達成したとはしない。

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

実用辞書のpinや変換規則を更新する場合は `tests/dictionaries/practical.lock.json` のソース・出力・除外記録のハッシュと件数を見直し、小辞書のgolden更新と混同しない。両辞書の全互換性、実用辞書のJIT回帰、ブラウザ、packを再実行し、旧artifactに結び付いた計測結果を新しい実装の結果として採用しない。
