# 参照実装と辞書の出所

検索結果の基準は [koron/cmigemo](https://github.com/koron/cmigemo/tree/e780fcf8dfe59fe3266ca8676906a3cefa1683e8) のC/Migemo 1.8.0。参照コミットは `e780fcf8dfe59fe3266ca8676906a3cefa1683e8`、取得アーカイブのSHA-256は `ce75e44da0c0391869b1889bf44823ce86d19a5311663d16d6e3375f259c8593`。2026-09-08に固定した。

同じコミットの `dict/{roma2hira,hira2kata,han2zen,zen2han}.dat` をUTF-8のまま使う。C本体と変換表は[上流MITライセンス](https://github.com/koron/cmigemo/blob/e780fcf8dfe59fe3266ca8676906a3cefa1683e8/LICENSE)のもとに配布されており、取得時にLICENSEも `.cache/reference/` へ保存する。検索コアの変換・語の区切り処理はこの固定版をもとに移植し、変換表を `src/romaji/data/` に保存する。各表のSHA-256と出典は `provenance.json`、上流の著作権表示は `src/romaji/LICENSE-CMIGEMO` に保持する。`scripts/generate-conversions.mjs --check` が原表と生成したMoonBitテーブルの一致を検証し、ビルドはライセンスを配布物にも含める。

小辞書は本リポジトリでテスト用に作成した `tests/fixtures/tiny-dict.tsv` と `alternate-dict.tsv`。同じTSVをC/Migemoへ直接渡し、jsmigemoのCompactDictionaryBuilderでcompact形式にも変換する。元データ・変換器・生成物のハッシュは `tests/fixtures/manifest.json` へ記録する。主辞書489バイト、別インスタンス用86バイト。

compact変換器は [jsmigemo 0.5.2](https://www.npmjs.com/package/jsmigemo/v/0.5.2)。npmパッケージのintegrityはpackage-lock.jsonに固定しており、MITライセンス。正規表現生成機能はmbmigemoの合否基準に使わない。jsmigemo固有の空白の扱いなどをC/Migemoへ混ぜない。

PBTでこの版のreaderに64ビット境界の末尾候補欠落を発見したため、テスト用読取関数に論理終端の補正を加えている。builderと辞書バイト列は上流のまま。縮小例・切り分け・回帰テストはdocs/testing.mdに記録する。PBTツールはfast-check 4.9.0（MIT）、間接依存もpackage-lock.jsonで固定する。

C/Migemo上流の実用辞書はSKK-JISYO.L由来で、[上流READMEは辞書にGPLが適用されると記載](https://github.com/koron/cmigemo/blob/e780fcf8dfe59fe3266ca8676906a3cefa1683e8/README.md#licenses)している。今回のCビルドは `BUILD_DICT=OFF` とし、その辞書を取得しない。jsmigemoの同梱辞書もテストや製品には接続しない。実用辞書の選定・版と原データの固定・配布時のライセンス整理はM3で行う。

製品へコンパイルされるMoonBit標準ライブラリのApache-2.0ライセンスとNOTICEも固定SDKから配布物へコピーする。開発用TypeScript 7.0.2／@types/node 26.0.0はpackage-lock.jsonへ固定し、製品にランタイム依存として同梱しない。

本プロジェクト全体のライセンスは未決定。上流のライセンスを本プロジェクトへ自動で適用したことにはしない。
