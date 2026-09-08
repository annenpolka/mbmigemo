# 参照実装と辞書の出所

検索結果の基準は [koron/cmigemo](https://github.com/koron/cmigemo/tree/e780fcf8dfe59fe3266ca8676906a3cefa1683e8) のC/Migemo 1.8.0。参照コミットは `e780fcf8dfe59fe3266ca8676906a3cefa1683e8`、取得アーカイブのSHA-256は `ce75e44da0c0391869b1889bf44823ce86d19a5311663d16d6e3375f259c8593`。2026-09-08に固定した。

同じコミットの `dict/{roma2hira,hira2kata,han2zen,zen2han}.dat` をUTF-8のまま使う。C本体と変換表は[上流MITライセンス](https://github.com/koron/cmigemo/blob/e780fcf8dfe59fe3266ca8676906a3cefa1683e8/LICENSE)のもとに配布されており、取得時にLICENSEも `.cache/reference/` へ保存する。検索コアの変換・語の区切り処理はこの固定版をもとに移植し、変換表を `src/romaji/data/` に保存する。各表のSHA-256と出典は `provenance.json`、上流の著作権表示は `src/romaji/LICENSE-CMIGEMO` に保持する。`scripts/generate-conversions.mjs --check` が原表と生成したMoonBitテーブルの一致を検証し、ビルドはライセンスを配布物にも含める。

小辞書は本リポジトリでテスト用に作成した `tests/fixtures/tiny-dict.tsv` と `alternate-dict.tsv`。同じTSVをC/Migemoへ直接渡し、jsmigemoのCompactDictionaryBuilderでcompact形式にも変換する。元データ・変換器・生成物のハッシュは `tests/fixtures/manifest.json` へ記録する。主辞書489バイト、別インスタンス用86バイト。

compact変換器は [jsmigemo 0.5.2](https://www.npmjs.com/package/jsmigemo/v/0.5.2)。npmパッケージのintegrityはpackage-lock.jsonに固定しており、MITライセンス。正規表現生成機能はmbmigemoの合否基準に使わない。jsmigemo固有の空白の扱いなどをC/Migemoへ混ぜない。

PBTでこの版のreaderに64ビット境界の末尾候補欠落を発見したため、テスト用読取関数に論理終端の補正を加えている。builderと辞書バイト列は上流のまま。縮小例・切り分け・回帰テストはdocs/testing.mdに記録する。PBTツールはfast-check 4.9.0（MIT）、間接依存もpackage-lock.jsonで固定する。

実用辞書は [skk-dev/dict の SKK-JISYO.L](https://github.com/skk-dev/dict/blob/0a164e6b990c5eb5b59eb7d8789f08865dc2f644/SKK-JISYO.L) を使う。コミット `0a164e6b990c5eb5b59eb7d8789f08865dc2f644`（2026-04-11T20:18:59Z）のEUC-JP原本4,489,815バイトを取得し、SHA-256 `c791f578d1b4040fce282db29bc22b2cc7ea46f83e269fab2e0fa779e2967e40` を検証する。原本ヘッダーと[上流の編集方針](https://github.com/skk-dev/dict/blob/0a164e6b990c5eb5b59eb7d8789f08865dc2f644/committers.md)に従い、辞書のライセンスは GPL-2.0-or-later。`tests/dictionaries/practical.lock.json` に原本・編集方針・GPL本文・生成物を固定する。GPL第2版本文は[GNUの公式本文](https://www.gnu.org/licenses/old-licenses/gpl-2.0.txt)から取得し、`tests/dictionaries/LICENSE-SKK-GPL-2.0` に保存してSHA-256を検証する。これによりセットアップ時のGNUサイトへの接続は不要になる。このファイルは辞書のライセンス本文であり、プロジェクト全体のライセンス指定ではない。

`npm run dictionary:prepare -- --fixture practical` で `.cache/dictionaries/practical/` に原本と著作権表示、GPL本文、NOTICE、同一語彙の `practical.tsv` と `practical.compact`、除外一覧、生成記録を用意する。`--fixture all` は小辞書2件も検証・再生成する。原本は改変せず保持し、UTF-8 TSVをC/Migemoとcompact変換器の両方に渡す。C/Migemo自身のビルドは引き続き `BUILD_DICT=OFF`。jsmigemo同梱辞書は使用しない。

語彙整形は固定C/Migemo版の [skk2migemo.pl](https://github.com/koron/cmigemo/blob/e780fcf8dfe59fe3266ca8676906a3cefa1683e8/dict/skk2migemo.pl) の変換方針を参考に、SKK注釈・送り仮名マーカーを外し、特殊キー・数値展開候補・Lisp式を除外する。重複する読みと候補は集合として統合してソートする。上流Perlスクリプトの空白削除は引き継がず、`_` の全角スペース候補など、候補そのものの空白を保存する。compactで表せない読みは変換器に渡す前に除外し、元の行番号・読み・理由を `exclusions.json` に全件記録する。この選定後の語彙を両実装で完全に共有し、検索時の候補数制限は加えない。

原本175,791行・240,299候補から、特殊キー1,198行（1,626候補）、compact範囲外19行（26候補）、数値展開1,833候補、Lisp式5候補を除外する。候補が残らない行は553行。174,021行を受け入れ、重複12,765候補を統合した結果、163,556読み・224,044候補になる。注釈削除31,443候補・送り仮名マーカー削除15,663行も記録する。各分類の総数が原本と一致することをテストで確認する。

生成compactは2,135,633バイト、SHA-256 `8fa973194468b4cc37e713e0c26c4a08625ee850d5c5db8497eb409d1263bc21`。TSVのSHA-256は `a0d3095aa83d143c396c4ffc94c29bebd16decff7be5149b3375d5242e95c2d3`。全読み・候補の往復検証を生成のたびに行う。実用辞書はローカル開発・比較・ベンチマーク用の別取得データとして扱い、Git管理の成果物やnpmライブラリ本体には同梱しない。生成辞書を別途配布する場合は、この原本・変換手順・著作権表示・GPL本文を一緒に扱う。

製品へコンパイルされるMoonBit標準ライブラリのApache-2.0ライセンスとNOTICEも固定SDKから配布物へコピーする。開発用TypeScript 7.0.2／@types/node 26.0.0はpackage-lock.jsonへ固定し、製品にランタイム依存として同梱しない。

本プロジェクト全体のライセンスは未決定。上流のライセンスを本プロジェクトへ自動で適用したことにはしない。
