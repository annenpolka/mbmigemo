# mbmigemo

MoonBitで実装する、ブラウザ向けの軽量なMigemoライブラリ。

ローマ字の `kensaku` から「検索」「けんさく」「ケンサク」などに一致する正規表現を生成する。同じ処理をJavaScriptとWasm GCへ出力し、配布容量・初期化時間・検索時の応答を実測して配布方法を決める。

現在は**テスト基盤の整備段階**。検索コア・公開API・性能測定はまだ実装していない。

[実装計画](PLAN.md)に、段階ごとの成果物、公開API案、互換性の基準、検証手順を記載している。[技術調査](docs/research/2026-09-08-moonbit-migemo.md)にはMoonBitの出力方式と現行の制限、一次資料をまとめた。

初期方針は、MoonBitの共通コアにローマ字変換・辞書探索・正規表現生成を置き、辞書取得と実際の照合はJavaScript側で行うこと。JavaScript版を先に仕上げ、Wasm GC版は同じ辞書・入力で比較する。

初版の検索結果の基準は **C/Migemo 1.8.0の固定コミット**。同じ語彙の小辞書とJavaScriptの `RegExp(..., "u")` で比較する。jsmigemo 0.5.2はcompact辞書の変換と読取確認に使う。C ABIの配布や全正規表現方言への対応は後続の検討対象。

Node.js 26.0.0、npm 11.16.0、C11コンパイラ、CMake 3.21以上、tarを用意して実行する。

```sh
npm ci --ignore-scripts
npm run reference:prepare
npm test
```

107件の手書きケース、固定シードの10,000入力、辞書の再現性、比較器の故障検出に加え、fast-checkによるPBTを実行する。PBTは各500試行、失敗時の反例を縮小してseed/pathを保存する。`npm run test:pbt:stress` は各5,000試行。記録したMoonBit SDKがある環境では `npm run test:all` でJS／Wasm GCの接続PBTも検証できる。

[テストの実行と本体の接続方法](docs/testing.md)、[ツールチェーン](docs/toolchain.md)、[辞書形式](docs/dictionary-format.md)、[上流とライセンス](docs/upstream.md)を参照。`test:api` と `test:compat` は未実装の本体を要求するため、現段階では失敗する。基盤テストの成功は検索機能の完成を意味しない。

プロジェクト全体のライセンスは未決定。今回使用した参照実装と辞書の出所・版・チェックサム・利用条件は記録済み。
