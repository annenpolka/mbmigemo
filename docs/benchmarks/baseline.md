# 実測ベースライン

測定日時: 2026-09-08T04:37:10.825Z ～ 2026-09-08T04:38:29.916Z。結論: **JSを既定のまま維持する（retain-js-default）**。Wasm GCは明示選択、または利用者が選んだautoで試せる実験版とする。Chromiumのquery p95は3回とも約23〜28%改善したが、初回応答は約2.05〜2.28倍。Brotliのcode合計も約6.1%大きく、9組の比較すべてで採用条件を満たさなかった。

## 条件

- CPU: Apple M4 Max (16 logical CPUs)、OS: darwin 25.6.0 arm64、RAM: 137438953472 bytes。
- Node: v26.0.0、Playwright: 1.63.0、moonc: v0.10.11+6ff76a5f9 (2026-08-28)、core: 0.10.11+6ff76a5f9。
- Git HEAD: 1215a72b537fcc6fb1d2b01bf9ae7a9017fecee4、tracked changes present: false。実際のcode・harnessのSHAは下記のcompact receiptに保存。
- 辞書: practical、SHA-256: 8fa973194468b4cc37e713e0c26c4a08625ee850d5c5db8497eb409d1263bc21。入力・期待値・文書のSHA-256: 22fc29f6bd9ced7fa93462c3a777bd26102a377ee60c3dfd4267c521a42f47a5。
- 110入力 × 370文書をC/Migemoと照合してから測定。クラス: dictionary, nasal, aliases, small-kana, geminate, case, width, unicode, metacharacter, whitespace, unknown, long, mixed-case-regression。
- 大規模互換性の前提: verified。test-results/compat-practical.json、report SHA-256: 752424dd6c05f7bc5155e318f33440423a8d49efeac4a130af4bb2885c7f51b9。両版各10,000以上のdistinct入力の成功を、測定対象のcode・辞書・現在の入力/文書コーパスSHAへ結び付ける。
- 各版3回の独立起動、各起動で2周warmup後に5周を測定。毎回ブラウザを新規プロセスで起動、版の順序を交互にし、処理を直列実行。
- 生データ: bench/results/2026-09-08T04-37-10.825Z/raw.json と workload.json（git除外）。再実行: npm run bench。手法の詳細は[methodology.md](methodology.md)。

## 容量（bytes）

各HTTP resourceを独立にgzip level 9／Brotli quality 11, generic, lgwin 22で圧縮し合算。JS版はindex.js+core.js、Wasm GC版はindex.js+feature-bytes.js+core.wasm。release出力の追加minifyは行わない。辞書、型定義、ライセンス、HTTP header、demoはcode合計に含めない。辞書は別行で両版共通。

| 対象 | raw | gzip | Brotli |
| --- | ---: | ---: | ---: |
| js | 190561 | 22753 | 15844 |
| wasm-gc | 58760 | 23306 | 16804 |
| dictionary | 2135633 | 1504786 | 1249022 |

## 公開API測定（ms）

初回応答は辞書取得完了後からwrapper import・コア取得/コンパイル・初期化・最初のkensaku展開・正規表現構築・文書照合の完了まで。取得開始からの総時間、各内訳、全サンプルとpattern長はreceiptに保存。warm percentileは個々の呼び出しを集計するnearest-rank。

| ブラウザ | run | 版 | 辞書取得 | 取得後初回応答 | query中央値 | query p95 | query p99 | RegExp構築 p95 | 照合 p95 |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| chromium 153.0.8010.12 | 1 | js | 5.320 | 36.425 | 0.015 | 3.660 | 11.770 | 0.010 | 0.035 |
| chromium 153.0.8010.12 | 1 | wasm-gc | 3.865 | 74.520 | 0.015 | 2.810 | 9.900 | 0.005 | 0.030 |
| chromium 153.0.8010.12 | 2 | wasm-gc | 4.175 | 68.380 | 0.015 | 2.850 | 10.065 | 0.005 | 0.030 |
| chromium 153.0.8010.12 | 2 | js | 3.680 | 31.770 | 0.015 | 3.855 | 11.970 | 0.010 | 0.035 |
| chromium 153.0.8010.12 | 3 | js | 5.035 | 39.535 | 0.020 | 4.860 | 16.375 | 0.010 | 0.045 |
| chromium 153.0.8010.12 | 3 | wasm-gc | 4.140 | 90.120 | 0.020 | 3.510 | 11.755 | 0.005 | 0.040 |
| firefox 155.0 | 1 | js | 4.880 | 78.320 | 0.040 | 9.120 | 30.760 | 0.020 | 0.060 |
| firefox 155.0 | 1 | wasm-gc | 5.900 | 127.780 | 0.040 | 11.800 | 44.880 | 0.020 | 0.060 |
| firefox 155.0 | 2 | wasm-gc | 4.440 | 883.720 | 0.060 | 13.720 | 50.480 | 0.020 | 0.360 |
| firefox 155.0 | 2 | js | 5.000 | 94.120 | 0.040 | 10.760 | 48.680 | 0.040 | 0.060 |
| firefox 155.0 | 3 | js | 216.080 | 99.320 | 0.040 | 13.320 | 48.140 | 0.040 | 0.060 |
| firefox 155.0 | 3 | wasm-gc | 5.000 | 121.600 | 0.040 | 11.980 | 45.500 | 0.020 | 0.060 |
| webkit 26.6 | 1 | js | 9.100 | 77.400 | 0.020 | 4.620 | 14.560 | 0.040 | 0.300 |
| webkit 26.6 | 1 | wasm-gc | 6.700 | 104.500 | 0.040 | 9.140 | 28.400 | 0.040 | 0.420 |
| webkit 26.6 | 2 | wasm-gc | 7.620 | 102.740 | 0.040 | 8.140 | 27.620 | 0.040 | 0.440 |
| webkit 26.6 | 2 | js | 6.180 | 68.780 | 0.020 | 4.540 | 16.260 | 0.040 | 0.320 |
| webkit 26.6 | 3 | js | 7.500 | 76.040 | 0.020 | 5.240 | 17.960 | 0.040 | 0.360 |
| webkit 26.6 | 3 | wasm-gc | 6.060 | 81.480 | 0.040 | 8.120 | 26.220 | 0.040 | 0.440 |

## コンパイルと辞書初期化の診断（ms）

公開API測定とは別の新規ブラウザプロセスで低水準exportsを呼ぶ補助測定。辞書初期化はUint8Array snapshotと、Wasmの場合Latin-1文字列転送を含む。JSのloadは取得/parse/compile/module評価の合計。WasmのcompileはWebAssembly.instantiate（コンパイルとinstance生成）でfeature probeを除外する。採用判断には公開APIの初回応答を用いる。

| ブラウザ | run | 版 | コアload | Wasm compile+instantiate | 辞書初期化 |
| --- | ---: | --- | ---: | ---: | ---: |
| chromium | 1 | js | 4.015 | — | 23.825 |
| chromium | 1 | wasm-gc | 0.940 | 2.020 | 62.690 |
| chromium | 2 | wasm-gc | 0.950 | 1.995 | 60.905 |
| chromium | 2 | js | 4.370 | — | 28.405 |
| chromium | 3 | js | 5.225 | — | 34.880 |
| chromium | 3 | wasm-gc | 1.300 | 2.715 | 82.465 |
| firefox | 1 | js | 10.280 | — | 78.080 |
| firefox | 1 | wasm-gc | 3.380 | 9.880 | 110.940 |
| firefox | 2 | wasm-gc | 13.360 | 10.920 | 118.400 |
| firefox | 2 | js | 12.220 | — | 69.140 |
| firefox | 3 | js | 23.220 | — | 1993.880 |
| firefox | 3 | wasm-gc | 6.040 | 8.380 | 96.260 |
| webkit | 1 | js | 8.600 | — | 53.920 |
| webkit | 1 | wasm-gc | 3.740 | 4.020 | 87.420 |
| webkit | 2 | wasm-gc | 2.920 | 4.100 | 90.500 |
| webkit | 2 | js | 9.220 | — | 63.240 |
| webkit | 3 | js | 8.800 | — | 57.180 |
| webkit | 3 | wasm-gc | 2.360 | 3.720 | 84.980 |

## メモリ観測（bytes）

performance.memory.usedJSHeapSizeの全ページ観測。回収時点・一時オブジェクト・エンジン内部の表現が混ざる。各版の保持辞書サイズやWasm GCの総量と解釈しない。Chromiumでは--enable-precise-memory-infoを使用し、GCを強制しない。

| ブラウザ | run | 版 | 取得前 | 初期化・初回応答後 | 全query後 |
| --- | ---: | --- | ---: | ---: | ---: |
| chromium | 1 | js | 2530174 | 20613637 | 28798381 |
| chromium | 1 | wasm-gc | 2528286 | 26392636 | 46188804 |
| chromium | 2 | wasm-gc | 2527966 | 26386464 | 45688024 |
| chromium | 2 | js | 2527738 | 20593593 | 28844765 |
| chromium | 3 | js | 2540470 | 20568233 | 28777545 |
| chromium | 3 | wasm-gc | 2541258 | 26425224 | 62273364 |
| firefox | 1 | js | unavailable | unavailable | unavailable |
| firefox | 1 | wasm-gc | unavailable | unavailable | unavailable |
| firefox | 2 | wasm-gc | unavailable | unavailable | unavailable |
| firefox | 2 | js | unavailable | unavailable | unavailable |
| firefox | 3 | js | unavailable | unavailable | unavailable |
| firefox | 3 | wasm-gc | unavailable | unavailable | unavailable |
| webkit | 1 | js | unavailable | unavailable | unavailable |
| webkit | 1 | wasm-gc | unavailable | unavailable | unavailable |
| webkit | 2 | wasm-gc | unavailable | unavailable | unavailable |
| webkit | 2 | js | unavailable | unavailable | unavailable |
| webkit | 3 | js | unavailable | unavailable | unavailable |
| webkit | 3 | wasm-gc | unavailable | unavailable | unavailable |

## 採用基準

compatibility AND (code Brotli <= 80% OR query p95 <= 80%) AND first response after dictionary fetch <= 110%, on every independent run (at least 3) in every measured browser。code Brotli比は1.061（Wasm/JS）。各独立起動で全条件を満たした場合だけ候補とする。性能の良かった一回や平均値で失敗を相殺しない。

| ブラウザ | run | 取得後初回応答比 Wasm/JS | query p95比 Wasm/JS | 判断 |
| --- | ---: | ---: | ---: | --- |
| chromium | 1 | 2.046 | 0.768 | retain JS |
| chromium | 2 | 2.152 | 0.739 | retain JS |
| chromium | 3 | 2.279 | 0.722 | retain JS |
| firefox | 1 | 1.632 | 1.294 | retain JS |
| firefox | 2 | 9.389 | 1.275 | retain JS |
| firefox | 3 | 1.224 | 0.899 | retain JS |
| webkit | 1 | 1.350 | 1.978 | retain JS |
| webkit | 2 | 1.494 | 1.793 | retain JS |
| webkit | 3 | 1.072 | 1.550 | retain JS |

## 制約

広い候補に展開するKaKaKaKaKaでは、warm queryに最大244.980 msを観測した。同じ入力の文書照合は最大2.180 msだった。正規表現JITの回帰を修正しても、候補展開の同期処理自体が重い入力は残る。大きな展開を対話画面で扱う場合は、アプリ側でWorkerへ処理を移す余地がある。

Firefoxには公開APIの取得後初回応答883.720 ms、別プロセスのJS辞書初期化1,993.880 msという大きなばらつきがあった。原因はこの測定では特定していない。外れ値を除外せず全実行を保存し、都合のよい再測定値への置き換えはしていない。これらの観測を一般的なブラウザの性能差とは解釈しない。

この測定は当該マシンのPlaywrightブラウザに限定される。WebKitはSafari実機の代替証拠ではない。localhostは非圧縮・遅延制御なしで、実回線のダウンロード時間を予測しない。JS dynamic importの取得・構文解析・コンパイル・module評価は分離できない。RegExpエンジンによるキャッシュと遅延コンパイルがあるため、constructor時間と照合時間を合わせて読む。メモリは非標準performance.memoryの観測値のみで、強制GCなし、Wasm GCを含む全プロセスメモリや辞書単独の保持量ではない。ブラウザ間のメモリ順位づけには使用しない。

機械可読の[baseline.json](baseline.json)に環境・設定・サマリー・サイズとcode/harness SHAを記録する。全ての有限テストの成功は全入力の意味同値の証明ではない。
