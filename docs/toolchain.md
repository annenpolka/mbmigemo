# ツールチェーン

2026-09-08に確認した値。固定SDKから両コアをビルドし、Nodeと実ブラウザで検索・機能判定を検証した。性能計測の条件は[ベンチマークの手法](benchmarks/methodology.md)に定義する。

| 対象 | 固定値／確認値 |
| --- | --- |
| Node.js | 26.0.0（`.nvmrc`） |
| npm | 11.16.0（`packageManager`） |
| jsmigemo | 0.5.2（devDependency、package-lockのintegrity付き） |
| fast-check | 4.9.0（devDependency、PRNGはxoroshiro128plus） |
| TypeScript / @types/node | 7.0.2 / 26.0.0 |
| @playwright/test | 1.63.0（ブラウザrevisionは同梱registryで固定） |
| C/Migemo | 1.8.0、e780fcf8dfe59fe3266ca8676906a3cefa1683e8（archive SHA-256付き） |
| moon | 0.1.20260827、d0aaa07、2026-08-27 |
| moonc / core | 0.10.11+6ff76a5f9、2026-08-28 |
| ローカルCコンパイラ | AppleClang 21.0.0.21000099 |
| Playwright Chromium | 153.0.8010.12 |
| Playwright Firefox | 155.0 |
| Playwright WebKit | 26.6 |
| Safari実機 | 26.6.2（21624.5.1.11.3、手動UI検証） |

Node/npm/jsmigemo/C/Migemo/MoonBitとnpmの開発依存はテスト基盤の固定値。Playwrightの3エンジンは固定したPlaywrightから導入する。Safari実機の版はこのマシンでの確認値で、リポジトリがSafariをインストール・固定するものではない。MoonBitの旧ローカル版0.9.1+cd5b07232は公式アーカイブが403で復元できなかったため、固定URLで取得できる0.10.11+6ff76a5f9へ明示的に更新した。グローバルSDKには変更を加えない。

`tests/moon/toolchain-lock.json` はmacOS ARM64、Linux x86-64のSDKと共通coreアーカイブのURL・SHA-256を固定する。SDK二種のハッシュは公式配布の `.tar.gz.sha256` と一致を確認した。coreのハッシュは取得した固定URLの内容から算出し、リポジトリで固定している（公式coreチェックサムURLは403）。`latest`へのフォールバックは行わない。

```sh
node scripts/prepare-toolchain.mjs
```

準備スクリプトは `.cache/toolchain/archives/` のアーカイブを毎回ハッシュ検査し、一時ディレクトリへ展開してcoreをbundleする。moon/moonc/coreの版を照合してから `.cache/toolchain/0.10.11+6ff76a5f9/<platform>-<arch>/` へ配置する。展開済みSDKの変更を再利用せず、ネットワークが利用できない場合も検査済みアーカイブから再構築できる。壊れたキャッシュは明示的に失敗する。SDKに含まれるライセンスファイルも展開先に保持する。

`--print-home` を渡すと同じ準備を実施したうえで、stdoutへSDKの絶対パスのみを出す。進行表示はstderrに出す。`npm run moon -- test --target js` などのnpmコマンドは復元先を自動選択する。手動でSDKを使用する場合は、そのパスを `MOON_HOME` として `<MOON_HOME>/bin` を `PATH` の先頭へ置く。環境変数名 `HOME` は変更しない。

このSDKの標準ライブラリは `moon.mod` 形式を使う。プロジェクトも `moon.mod` と各パッケージの `moon.pkg` を使う。ソース配置は `src/`、ブリッジ試験は `src/bridge/`。

`tests/moon/toolchain.json` は実行時のmoon/moonc/core照合用、`toolchain-lock.json` は復元用。pin更新時は両者を一致させ、JS/Wasm GC双方のMoonBitテストとNode経由のブリッジ試験を再実行する。新SDKでは両出力先のMoonBitテスト、日本語・NUL・単独サロゲートの文字列往復、および65,536バイトの所有権とJS/Wasm GC間checksum一致を確認した。

接続プローブはreleaseビルドをNodeから実際に呼ぶ。JSのBytesはUint8Arrayとして渡し、MoonBit内で一回コピーする。Wasm GCでは試験用に各バイトを同値のUTF-16コード単位へ載せた一時JS文字列を作り、MoonBitのBytesへ一回コピーする。戻り値のGC参照は不透明なハンドルとして扱う。入力を変えても古いハンドルは変化しない。

Wasm側の転送は一括の関数呼出しだが、JSでの文字列の実体化とMoonBitでのバイト配列の実体化がある。エンジン内部の物理コピー回数は測っていない。検索APIでもこの一括文字列転送を使う。APIは最初のawaitより前にbyte viewをUint8Arrayへ取り込み、辞書リーダーは初期化時に平坦な索引配列へ変換する。JS版の整数索引は通常の配列で、圧縮されたバイト列のまま保持する実装ではない。

`bench` は実用辞書の初期化前後と検索後に、対応エンジンの `performance.memory` を観測する。これは非標準のJS heap情報であり、ライブラリ単独の常駐量・Wasm GC全体・プロセスRSS・物理コピー回数を表さない。APIがないブラウザはunavailableとして記録し、異なる手法の数値を同じ指標として比較しない。

文字列はJS String Builtinsを有効にして通常の `WebAssembly.instantiate` を使う。JS／Wasm GCの両方で日本語、半角カナ、結合濁点、補助平面文字、NUL、単独サロゲートを確認した。バイト列は0/127/128/255、全256値を含む65,536バイト、小辞書二種類、途中のviewを確認した。NodeではGC構造体とJS文字列機能のプローブ、auto切替、遅延ロードと失敗時の扱いを公開APIのテストで確認する。

実ブラウザは `npm run browser:prepare` で `.cache/ms-playwright/` へ導入し、`npm run test:browser` で検証する。Linuxのシステム依存を含める場合は `PLAYWRIGHT_BROWSERS_PATH=.cache/ms-playwright npx playwright install --with-deps chromium firefox webkit` を使う。Playwright Chromium・Firefox・WebKitの上記3版で48テストが全成功し、いずれもWasm GC＋JS String Builtinsの実プローブが成功した。機能を意図的に無効にした環境でautoがJSへ切り替わることと、辞書・artifactの破損やruntime trapでは切り替わらずエラーになることを別に検証する。

Safari実機ではJS、Wasm GC、autoの実行方式を画面から切り替え、実用辞書の検索と入力クリアを確認した。Remote Automationが無効だったため、WebDriverではなく手動UIでの確認である。Playwright WebKitの自動テストやブラウザ計測結果をSafari実機の結果として扱わない。具体的な確認操作と検証範囲は[テスト基盤](testing.md#ブラウザとdemo)を参照する。

macOSの制限された実行環境では、ブラウザ起動時のMachポート作成が拒否される場合がある。今回のローカル自動検証は、ブラウザ起動に必要な権限を持つ実行環境で行った。ブラウザ起動前の権限エラーをライブラリの機能未対応として記録しない。

設定は[MoonBit公式のpackage設定](https://docs.moonbitlang.com/en/latest/toolchain/moon/package.html)と[FFIの型対応](https://docs.moonbitlang.com/en/latest/language/ffi.html)を参照し、上のSDKで実行して確認した。公式文書は更新されるため、版の変更時は両出力先のプローブを再実行する。

SDK配布方法とチェックサムは[MoonBit公式ダウンロード手順](https://www.moonbitlang.com/download#verifying-binaries)を参照した。復元スクリプトは公式installerを実行せず、上記で固定したアーカイブだけを利用する。
