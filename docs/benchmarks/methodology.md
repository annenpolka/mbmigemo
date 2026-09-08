# ベンチマークの手法

`npm run size`はビルド済みの公開ファイルを測り、`npm run bench`は固定した実用辞書と107の手書き入力・3の実用辞書回帰入力を使ってPlaywright Chromium・Firefox・WebKitの各3回を測る。`npm run build`、`npm run dictionary:prepare -- --fixture all`、`npm run reference:prepare`、ブラウザの導入、`npm run test:practical`を先に行う。測定中は他のCPU負荷の高いビルド・テストを止める。

対象を絞る例は`npm run bench -- --browsers chromium --runs 3`。`--fixture tiny --runs 1 --warmup 1 --rounds 1`はハーネスのsmoke確認用で、実用辞書の採用根拠には使わない。`--output`は生データのディレクトリ、`--summary`はMarkdownと同名JSONの書き出し先を指定する。実用辞書で3回以上測った場合の既定出力先は`docs/benchmarks/baseline.md`と`baseline.json`。

実用辞書では`test-results/compat.json`（変更する場合は`--compat-report`）の完了済みpassing結果を必須とする。JS・Wasm GCの各laneが10,000以上のdistinct入力で差分0であり、4つの公開artifact・辞書/元TSV・現在の全入力/文書コーパス・C参照のSHA/版が一致することを測定前に検証する。report自身のSHAと各laneの件数をreceiptのreferenceEligibilityへ保存し、測定中のreport変更も失敗にする。古いbuildの成功や手書きだけの成功では測定を開始しない。tiny smokeは免除するが採用判断を行わない。

## ワークロードと妥当性

固定入力は`tests/fixtures/cases.json`と、実用辞書の場合は`tests/practical/cases.json`の全行を使う。最初の入力kensakuを維持する。実用辞書の回帰3入力（ToUKYoUGaKKoUtouKyoU、ShASHiNnIhOngOkensaku、KaKaKaKaKa）は、旧来の平坦な選択パターンでRegExp JITが極端に遅くなった条件を含む。

文書は`documents.json`、元辞書の行順から等間隔に128行まで抽出した候補、入力文字列そのもの、および回帰入力のneedlesを先頭・中間・末尾へ埋め込んだ文書を重複排除して使う。ローマ字の完全形・接頭辞・n/nn・拗音・促音・幅・大小文字・Unicode・正規表現メタ文字・空白・未知語・長文を含む。全クラスを等しい重みの個々の入力として扱うため、実際のユーザーの入力頻度分布を再現するものではない。

同じ元TSVを読む固定C/Migemoから一致集合を作る。各ブラウザの各版で、計時する全入力の全対象文書への一致がCと同じことを確認してからwarm計測を受け入れる。生成正規表現の文字列同一性はCとの合否条件にしない。mbmigemo自身の同じ入力に対する出力は毎回一致することを確認し、候補の省略・不安定な出力を速度として採用しない。各入力のpattern長、C pattern長とSHA、辞書・ワークロード・実行コード・ハーネスのSHAを保存する。製品全体の10,000件以上の互換性検証は`npm run test:practical`で別に実行する。

## コールド起動

公開API測定ごとに新規のブラウザプロセスを起動し、専用ハーネスだけを開く。辞書fetch開始から最初の検索完了までを測る。HTMLやハーネスのnavigationは計測外で、コード・辞書のHTTP応答はすべてno-storeとする。OSのファイルキャッシュやシステム全体まで冷たくするとは主張しない。版の測定順をrunごとに反転し、同時実行しない。

公開APIの辞書取得後初回応答にはwrapper import、選択版のcoreロード/compile、Wasm機能判定、所有権確保のsnapshot、辞書転送・初期化、最初のkensaku query、RegExp構築と全対象文書への照合を含む。採用判断にはこの値を用いる。辞書取得を含む総時間と各内訳も生データへ保存する。loopback HTTPは圧縮なし・遅延制限なしで、実回線の転送時間を代弁しない。

初期化の内訳を診断する補助測定は、さらに別の新規ブラウザプロセスで低水準のexportsを使う。JS dynamic importのnetwork/parse/compile/module評価はブラウザAPIで分離できないので合計として明記する。Wasmは取得とWebAssembly.instantiateを分ける。辞書初期化は公開wrapperのUint8Array snapshotとWasmのLatin-1 transportを同じ順序で再現する。機能判定を含まないこの診断値を公開APIの起動時間の代わりに使わない。wrapperの転送方式を変えた場合は診断側も見直す。

## ウォーム検索

既定で2周warmupし、その後5周、performance.nowで個々のquery・RegExp構築・文書照合を計測する。同じ入力順を両版に使い、計測周回の開始位置を17ずつ回す。すべてのサンプルを保存し、nearest-rankで中央値・p95・p99を求める。タイマー分解能の観測値とゼロに量子化されたサンプル数を記録し、ゼロを都合よく除かない。

RegExpのconstructorは同じpatternを再利用する実用的な呼び出しで、エンジンの内部キャッシュを無効化しない。コンパイルが最初のtestへ遅延される可能性があるので、構築・照合・合計を別々に保存し、constructor時間だけで正規表現の総コストを説明しない。計測途中ではC参照や互換性比較処理を実行しない。

## メモリと容量

performance.memoryを公開するブラウザでは取得前・初期化/初回応答後・全query後のJS heap使用量を記録する。Chromiumではprecise-memory-infoを有効にするが、GCは強制しない。非標準APIであり、全プロセスメモリ・Wasm GC総量・辞書単独の保持量を意味しない。APIがない場合はunavailableとして保存し、別の手法で埋めた数値を直接比較しない。

容量はrelease出力の各resourceを独立に圧縮してから加算する。JS版はindex.js+core.js、Wasm GC版はindex.js+feature-bytes.js+core.wasm。gzip level 9、Brotli quality 11・generic・lgwin 22を固定し、Node・圧縮ライブラリ版も保存する。辞書のraw/gzip/Brotliを別に記録する。型定義・ライセンス・HTTP headers・demo・sourcemapsは実行コード合計に含めない。辞書を含む総転送量はcode行とdictionary行の和になる。

## 判断

PLANの暫定基準を`bench/decision.mjs`に固定する。意味互換性に成功し、Wasm GCのcode Brotli合計がJSの80%以下、またはquery p95が80%以下であり、かつ辞書取得後初回応答がJSの110%以下となることを、各対象ブラウザの少なくとも3回すべてで求める。未対応・欠測・timerゼロ・NaN・一回の起動回帰は合格にしない。良い平均値や一回だけの最速結果で失敗を相殺しない。

合格は測定した環境の候補判定であり、すべての端末・実ブラウザでの性能保証ではない。Playwright WebKitをSafari実機として報告しない。結果が基準を満たさなければ既定JSを維持し、Wasm GCは明示選択の実験版として扱う。
