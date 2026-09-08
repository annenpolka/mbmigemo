# 参照実装と辞書の出所

検索結果の基準は [koron/cmigemo](https://github.com/koron/cmigemo/tree/e780fcf8dfe59fe3266ca8676906a3cefa1683e8) のC/Migemo 1.8.0。参照コミットは `e780fcf8dfe59fe3266ca8676906a3cefa1683e8`、取得アーカイブのSHA-256は `ce75e44da0c0391869b1889bf44823ce86d19a5311663d16d6e3375f259c8593`。2026-09-08に固定した。

同じコミットの `dict/{roma2hira,hira2kata,han2zen,zen2han}.dat` をUTF-8のまま使う。C本体と変換表は[上流MITライセンス](https://github.com/koron/cmigemo/blob/e780fcf8dfe59fe3266ca8676906a3cefa1683e8/LICENSE)のもとに配布されており、取得時にLICENSEも `.cache/reference/` へ保存する。Cソースや変換表を製品へ組み込む変更ではない。

小辞書は本リポジトリでテスト用に作成した `tests/fixtures/tiny-dict.tsv` と `alternate-dict.tsv`。同じTSVをC/Migemoへ直接渡し、jsmigemoのCompactDictionaryBuilderでcompact形式にも変換する。元データ・変換器・生成物のハッシュは `tests/fixtures/manifest.json` へ記録する。主辞書489バイト、別インスタンス用86バイト。

compact変換器は [jsmigemo 0.5.2](https://www.npmjs.com/package/jsmigemo/v/0.5.2)。npmパッケージのintegrityはpackage-lock.jsonに固定しており、MITライセンス。正規表現生成機能はmbmigemoの合否基準に使わない。jsmigemo固有の空白の扱いなどをC/Migemoへ混ぜない。

C/Migemo上流の実用辞書はSKK-JISYO.L由来で、[上流READMEは辞書にGPLが適用されると記載](https://github.com/koron/cmigemo/blob/e780fcf8dfe59fe3266ca8676906a3cefa1683e8/README.md#licenses)している。今回のCビルドは `BUILD_DICT=OFF` とし、その辞書を取得しない。jsmigemoの同梱辞書もテストや製品には接続しない。実用辞書の選定・版と原データの固定・配布時のライセンス整理はM3で行う。

本プロジェクト全体のライセンスは未決定。上流のライセンスを本プロジェクトへ自動で適用したことにはしない。
