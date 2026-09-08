# ツールチェーン

2026-09-08に確認した値。SDKとブラウザの性能比較はまだ行っていない。

| 対象 | 固定値／確認値 |
| --- | --- |
| Node.js | 26.0.0（`.nvmrc`） |
| npm | 11.16.0（`packageManager`） |
| jsmigemo | 0.5.2（devDependency、package-lockのintegrity付き） |
| C/Migemo | 1.8.0、e780fcf8dfe59fe3266ca8676906a3cefa1683e8（archive SHA-256付き） |
| moon | 0.1.20260427、48d7def、2026-04-27 |
| moonc / core | 0.9.1+cd5b07232、2026-04-28 |
| ローカルCコンパイラ | AppleClang 21.0.0.21000099 |

Node/npm/jsmigemo/C/Migemoはテスト基盤の固定値。MoonBitは既に入っていたSDKで両出力先の動作を確認した値であり、新規環境への固定版インストールは未完了。公式配布元のこの版のarchive URLは今回403となった。`latest`へ黙って置き換えず、復元可能なSDKの固定・CI導入をM1の残項目にする。グローバルSDKには変更を加えていない。

現在のSDKはモジュール定義に `moon.mod.json`、パッケージに `moon.pkg` を使う。モジュールのsourceは `tests/moon` で、検索コアを装った空パッケージは作っていない。M2で検索コアを作るときにsource配置を整理する。

`test:moon`と`test:bridge`は `tests/moon/toolchain.json` のmoon/moonc/coreと実行環境を照合する。版が異なれば明示的に失敗する。固定値の確認はできるが、このファイルだけでSDKをダウンロードできるわけではない。

接続プローブはreleaseビルドをNodeから実際に呼ぶ。JSのBytesはUint8Arrayとして渡し、MoonBit内で一回コピーする。Wasm GCでは試験用に各バイトを同値のUTF-16コード単位へ載せた一時JS文字列を作り、MoonBitのBytesへ一回コピーする。戻り値のGC参照は不透明なハンドルとして扱う。入力を変えても古いハンドルは変化しない。

Wasm側の転送は一括の関数呼出しだが、JSでの文字列の実体化とMoonBitでのバイト配列の実体化がある。エンジン内部の物理コピー回数は測っていない。この試験方式を製品の辞書ABI・ゼロコピー・メモリ効率達成の根拠にはしない。

文字列はJS String Builtinsを有効にして通常の `WebAssembly.instantiate` を使う。JS／Wasm GCの両方で日本語、半角カナ、結合濁点、補助平面文字、NUL、単独サロゲートを確認した。バイト列は0/127/128/255、全256値を含む65,536バイト、小辞書二種類、途中のviewを確認した。ブラウザやautoの機能検出は未検証。

設定は[MoonBit公式のpackage設定](https://docs.moonbitlang.com/en/latest/toolchain/moon/package.html)と[FFIの型対応](https://docs.moonbitlang.com/en/latest/language/ffi.html)を参照し、上のSDKで実行して確認した。公式文書は更新されるため、版の変更時は両出力先のプローブを再実行する。
