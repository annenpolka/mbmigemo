# mbmigemoの共通コアとブラウザ向け配布を実装する


この計画は実装とともに更新する。Progress、Surprises & Discoveries、Decision Log、Outcomes & Retrospectiveには、実際に完了したこと、観測した事実、判断と理由を記録する。初期コミットは計画のみで、2026-09-08にテスト基盤を先行追加した。現在は実用辞書・公開API・ブラウザデモまで実装し、両版の互換性と実ブラウザを検証済み。性能測定を完了しJSを既定に採用した。Linux/macOSのCIと配布確認も成功し、M1〜M6を完了した。


## Purpose / Big Picture


ローマ字で日本語を検索できる、小さいライブラリを作る。実装後はブラウザで辞書を読み込み、kensakuを入力すると「検索」「けんさく」「ケンサク」を含む候補を探せる。アプリケーションの実装者は正規表現の文字列を受け取り、JavaScriptのRegExpで自分のデータを検索する。

同じMoonBitの検索コアからJavaScript版とWasm GC版を作り、動作をそろえる。Wasm GCとは、WebAssemblyのオブジェクトをブラウザ側の自動メモリ管理で保持する仕組みである。JavaScript版を最初に利用可能にし、Wasm GC版の配布は実測結果で判断する。容量と速度について、まだ測っていない数値を達成済みとして扱わない。


## Progress


- [x] (2026-09-08 01:56:26Z) MoonBitの出力先、文字列処理、nativeライブラリ出力の制限を調査した。
- [x] (2026-09-08 01:56:26Z) プロジェクト名をmbmigemoとし、初版の範囲と検証方法をこの計画にまとめた。
- [x] (2026-09-08 02:39:08Z) テスト基盤を先行整備した。固定C/Migemo、小辞書二種類、107手書きケース、10,000生成入力、比較器の故障検出、将来の公開API契約、JS・Wasm GC接続プローブを追加した。
- [x] (2026-09-08 03:02:17Z) fast-check 4.9.0でPBTを追加した。通常6プロパティと接続2プロパティを各500試行、別seedで通常6プロパティを各5,000試行して成功。反例の縮小とseed/path再現、API用PBT、CIの複数seedと結果保存も追加した。
- [x] (2026-09-08) M1: 参照実装とSDKを固定して復元し、JS・Wasm GCの接続を検証。Linux/macOS × 2 seedのCIで検索コア・PBT・配布物確認まで成功（run 34184453471）。実用辞書の選定はM3で行う。
- [x] (2026-09-08 03:38:54Z) M2: 小辞書の共通検索コアとJS／Wasm GCの公開APIを実装。両版で10,107ケース・各1,232,198文書照合と、追加1,781入力・各68,576候補照合が成功。
- [x] (2026-09-08) M3: SKK-JISYO.Lの固定辞書とデモを接続。163,556読み・224,044候補で各版12,107ケース・1,471,006文書照合の差分0。
- [x] (2026-09-08) M4: Chromium・Firefox・WebKitの48テストでJS／Wasm GC／auto、未対応・破損・再試行・遅延ロードを検証。Safari 26.6.2実機でも3方式、検索・消去・強調表示を確認。
- [x] (2026-09-08) M5: M4 Maxで3ブラウザ各3回、計18試行を測定。容量・起動・query分位・正規表現構築と照合・メモリ観測を記録。9組すべてでWasmの採用条件を満たさず、JSを既定として維持。
- [x] (2026-09-08) M6: README・測定結果・制約を記録し、小辞書／実用辞書のnpm packを独立TypeScriptプロジェクトで確認。最終実装1215a72のCI全6構成が成功（run 34187248404）。npm公開は行わない。


## Surprises & Discoveries


測定前の出所照合が、negative CLIテストによる互換性成功記録の上書きを検出して停止した。CLIテストの出力を一時ディレクトリへ隔離し、実用辞書の完走結果はcompat-practical.jsonへ保存する。小辞書の通常検証で実用辞書の記録が失われないようにし、全比較を再実行して測定へ渡す。

実用辞書で、平坦な選択肢を連結した正規表現の初回照合が極端に遅くなった。V8のサンプルではRegExp JITのBoyer-Moore探索用処理に滞在し、ToUKYoUGaKKoUtouKyoUは約4.1秒、KaKaKaKaKaは15秒のタイムアウトで再現した。共有接頭辞を木としてまとめ、終端の文字集合を文字クラスへ圧縮すると、前者の初回照合は約37ミリ秒（同条件のCパターンは約30ミリ秒）となり、両版の回帰テストが通った。候補を制限せず、3反例を独立プロセスの時間制限付きテストへ固定した。全実用辞書比較も修正後に再実行した。

小辞書の10,107ケースの文書照合が成功した後、変換表から生成した正規表現の有限候補を直接列挙する検証で、KensakuNihongoが検索機Nihongoに誤って一致する差分を発見した。C/Migemoは句ごとに短い受理候補があればその子孫を除いてから連結する。この処理を合わせ、単独サロゲートが補助平面文字を誤って除かないようUnicode境界を確認する。既定のMoonBit String Compareは長さ優先なので、接頭辞をまとめる順序は明示する。M3の共有接頭辞の木では、補助平面文字と単独サロゲートの枝が隣接するようUnicodeコードポイント順を用いる。

初期の正規表現エスケープで、UTF-16コード単位をStringViewの検査付きsliceで取り出すと、絵文字の途中で例外になることを実際の両コアで確認した。位置を検査したcode-unit単位のsubstringへ修正し、補助平面・孤立サロゲートをMoonBitとAPI PBTで検証する。

旧SDKの復元不能を解消するため、固定URLで取得できるmoonc/core 0.10.11+6ff76a5f9へ更新した。macOS ARM64／Linux x64のSDKとcoreアーカイブをSHA-256で固定し、リポジトリの.cacheへ復元する。グローバルSDKは変更しない。新SDKのformatterに合わせ、moon.mod.jsonをmoon.modへ移行した。

PBTのseed 20260908で、jsmigemo 0.5.2の対応ビット列が64ビット境界で終わると末尾候補が欠落するケースを発見した。185回の縮小で7項目の辞書となり、さらにASCIIの1読み・62候補でも再現した。候補index列は正しく、readerのnextClearBitが終端で-1を返すのが原因。テスト用readCompactDictionaryで論理終端を補い、元の縮小例と64/128/192ビット境界を回帰テストにした。辞書バイト列・builder・C検索参照は変更していない。

2026-09-08の実行で、C/Migemo 1.8.0は空白入力を保持し、jsmigemo 0.5.2は空白を読み飛ばすことを確認した。両方を無条件に同じ検索仕様とは扱えない。ユーザーの提案を受け、検索結果の基準をC/Migemoにした。

C/MigemoのCLI対話入力は255バイトまでのため、テストはC APIを静的リンクした16進数プロトコルのドライバを使用する。改行を含む入力と1,024文字の入力を実際に通した。変換表の不足も明示的に失敗させる。

テスト基盤作成時、このマシンのMoonBit SDKはmoonc/core 0.9.1+cd5b07232だった。JS・Wasm GCの接続テストは成功したが、同版archive URLは403となった。この時点ではCIをNode/Cの基盤に限定し、M2実装時に上記の固定SDK復元へ移行した。

事実として、2026年9月8日に確認したMoonBit公式文書では、nativeバックエンドのforeign_libraryからリンク可能なライブラリ成果物を出す経路は未対応で、.soと.dllも含まれる。C ABIとは、C言語の関数として別のプログラムから呼ぶ際の取り決めである。MoonBitからC関数を呼べることを、C ABIのライブラリ配布が完成している証拠にはしない。

事実として、MoonBitのWasm GCとJavaScriptの出力先はホストのGCを使うが、通常のWasmとnativeでは参照カウントを使う。JS String Builtinsは、WasmからホストのJavaScript文字列操作を利用する別の機能である。Wasm GCへの対応だけで、この文字列機能も使えるとは判定しない。

事実として、公式の182バイトという例は小さい文字列連結処理のWasm本体であり、Migemo、接続用JavaScript、辞書を含む値ではない。この小さい例を今回のMigemoの測定値には使わない。

上記の調査根拠と確認日はdocs/research/2026-09-08-moonbit-migemo.mdに保存する。実装時は、選んだコンパイラの版で挙動を再確認し、変化があればこの欄を更新する。


## Decision Log


- Decision: M5の実測に基づきJSを標準とし、Wasm GCは利用者が明示したwasm-gcまたはautoから使う実験版に留める。
  Rationale: Brotliの実行code合計はJS15,844バイトに対してWasm16,804バイト。Chromiumのquery p95は約23〜28%改善したが、取得後初回応答は約2.05〜2.28倍。Firefox・WebKitも含む全9組で既定変更の基準を満たさなかった。判定基準は変更しない。
  Date/Author: 2026-09-08 / Codex

- Decision: 実用辞書をskk-dev/dictのコミット0a164e6b990c5eb5b59eb7d8789f08865dc2f644のSKK-JISYO.Lへ固定する。
  Rationale: 元データ・ライセンス・変換規則・除外理由を保存し、同一TSVからcompactとC参照を構成できる。辞書はパッケージへ同梱しない。SHA-256と全読み・候補の往復一致を準備時に検証する。
  Date/Author: 2026-09-08 / Codex

- Decision: 性能測定前に、同じ配布物・辞書・全コーパスで完了した両版の実用辞書互換性レポートを必須とする。
  Rationale: 古いビルドや小辞書の成功を、測定対象の互換性として流用しないため。測定ごとの文書一致も検証し、3回の各実行で採用基準を満たすか機械的に判定する。
  Date/Author: 2026-09-08 / Codex

- Decision: M2で小辞書の公開APIをJS／Wasm GC双方へ接続し、実用辞書の選定はM3にまとめる。
  Rationale: 既存のAPI契約とPBTを実コアへ早く適用できる。Nodeでの両版の成功はブラウザ配布・実用辞書の完成とは区別し、既定はJSのままとする。
  Date/Author: 2026-09-08 / Codex

- Decision: 固定文書集合の比較に、有限な正規表現の候補を列挙して相互に照合する検証を追加する。
  Rationale: 句ごとの候補の省略が連結後に与える影響を、既存文書に現れない候補でも検出するため。列挙器は対応構文と生成量を限定し、未対応を明示的に失敗させる。
  Date/Author: 2026-09-08 / Codex

- Decision: 初期実装の辞書は検証済みの平坦な索引配列へ一度展開する。
  Rationale: ノードごとのオブジェクトや問い合わせごとの全辞書再構築を避けつつ、LOUDSの不正・範囲外・終端を初期化時に検証できる。JSの通常配列によるメモリ増加は実用辞書で測定する。
  Date/Author: 2026-09-08 / Codex

- Decision: 固定コーパスに加えてfast-checkの縮小可能なPBTを使い、結果と再現情報を保存する。
  Rationale: 固定された1万入力だけでは辞書構造・バイト境界・操作履歴の組み合わせを探索できない。Map/startsWith、文字列includes、BigIntのチェックサムを独立した期待値として使う。SDK不要のPBTはnpm testへ、実コンパイルを要する接続PBTはtest:bridgeへ入れる。
  Date/Author: 2026-09-08 / Codex

- Decision: 現在成立する基盤検証と、まだ存在しない本体への契約テストを別コマンドにする。
  Rationale: npm testの成功を本体の互換性達成と誤認しないため。test:apiとtest:compatは実装がなければ失敗し、代替実装やskipでは成功させない。実装接続後はtest:implementationをCIの必須検証へ加える。
  Date/Author: 2026-09-08 / Codex

- Decision: 空入力、NUL、単独サロゲートはC文字列の参照比較から分け、mbmigemoの契約としてテストする。
  Rationale: 空入力は既定の(?!)、その他は入力を欠落・正規化させず文字どおり扱う。参照の制約をmbmigemoの暗黙の入力切り捨てにしない。
  Date/Author: 2026-09-08 / Codex

- Decision: ブラウザ向けのJS版を先に完成させ、同じコアからWasm GC版を作る。
  Rationale: JS版が比較の基準と互換性の広い配布先になる。Wasm GCの小型化は有望だが、辞書を含む結果はまだ不明である。
  Date/Author: 2026-09-08 / Codex

- Decision: 初版の挙動は、C/Migemo 1.8.0、コミットe780fcf8dfe59fe3266ca8676906a3cefa1683e8を基準にする。初期案のjsmigemo参照を置き換える。
  Rationale: ユーザーの提案を受け、検索の振る舞いはC/Migemoを基準にする。同じTSV語彙を使い、JavaScript向け演算子で文書集合への一致を比較する。jsmigemo 0.5.2はcompact辞書の変換・読取確認に残す。
  Date/Author: 2026-09-08 / Codex

- Decision: 初版ではjsmigemoのcompact dictionary形式を読む。独自の辞書形式は導入しない。
  Rationale: 同じバイナリ辞書を使えば、コードとデータの改善を分けて測れる。形式の詳細と利用条件はM1で固定した参照実装から抽出して記録する。
  Date/Author: 2026-09-08 / Codex

- Decision: 辞書取得、実行対象の選択、文書への正規表現照合はJavaScript側に置く。
  Rationale: コアをファイルシステムやブラウザUIから独立させ、正規表現エンジンの追加同梱を避けるため。
  Date/Author: 2026-09-08 / Codex

- Decision: 入力を文字どおり扱い、候補の黙示的な切り捨てを行わない。
  Rationale: 候補を減らして速度を良く見せる実装は、検索結果の互換性を損なう。制限が必要なら仕様とエラーを明示し、基準実装との違いを記録する。
  Date/Author: 2026-09-08 / Codex

- Decision: privateの計画リポジトリから始める。初回の作業はREADME・調査・実装計画の配置までとする。
  Rationale: 公開範囲は指定されておらず、今回依頼された成果はリポジトリ初期化と計画の配置である。実装やパッケージ公開は今後の作業として扱う。
  Date/Author: 2026-09-08 / Codex


## Outcomes & Retrospective


M6までの受け入れ条件を満たした。実装コミット1215a72のGitHub Actions（https://github.com/annenpolka/mbmigemo/actions/runs/34187248404）で、Linux/macOS×2 seedのコア・PBT4構成と、Linux/macOSの実用辞書・3ブラウザ・pack2構成がすべて成功した。配布物には利用例のREADME、型、両コア、feature probeと上流ライセンスを含め、小辞書／実用辞書を別のTypeScriptプロジェクトからJS・Wasm GC・autoで利用できた。

今後の範囲は、広い入力での同期queryの負荷、Wasm初期化時の転送・辞書展開コストの改善、別端末での性能確認、npm公開前の全体ライセンス決定など。今回の有限コーパスの成功を全入力の同値証明や全端末の性能保証とは扱わない。Wasm標準化の条件は未達だが、計画どおりJSを標準として配布判断を完了した。

M5の測定はcleanなコミット1215a72、Apple M4 Max、Node26.0.0、Playwright1.63.0で行った。3ブラウザ×両版×3回を別プロセスで直列に測り、各試行で110入力×370文書のC比較が成功した。各550・合計9,900の計時サンプルを保存し、独立した再計算でも集計値と採用判定が一致した。生の観測値はbench/results/、環境・ハッシュ・各回の集計・判断はdocs/benchmarks/baseline.mdとbaseline.jsonに記録。Firefoxの大きな起動値も除外しない。メモリはChromiumの非標準JS heap観測のみ取得でき、Firefox/WebKitはunavailableとして総メモリの比較には使わない。既定はJSのまま、Wasm GCは実験的な選択肢として配布する。

M3/M4では固定した実用辞書2,135,633バイト（SHA-256: 8fa973194468b4cc37e713e0c26c4a08625ee850d5c5db8497eb409d1263bc21）を利用する。10,000の保存済み生成ケースに、1,000の辞書項目から完全な読みと途中入力を作る2,000ケースを追加し、計12,107ケース・11,707 distinct入力を両版で照合した。各1,471,006照合で差分0。小辞書の比較、有限候補列挙、18プロパティ各500試行も継続して成功した。MoonBitは各27テストへ増え、文字クラス・長い枝・サロゲート境界を検証する。

Playwright 1.63.0のChromium 153.0.8010.12、Firefox 155.0、WebKit 26.6で各16・計48テストが成功した。Safari 26.6.2（21624.5.1.11.3）はGUIで実用辞書・JS／Wasm GC／autoを選択し、kensaku、nihongoの強調表示、消去時の0件、実backendと辞書SHAを確認した。SafariのWebDriver自動化は設定無効のため実行せず、Playwright WebKitとは別の手動確認として記録する。

M2のtest:allが成功した。固定基盤18件、基盤PBT6件、MoonBit各23件、接続固定／PBT6件、API契約・PBT・追加オラクル1,046件（辞書切断の子テストを含む）。18プロパティは各500試行。API・辞書変異の10プロパティは別seed 104729でも各500試行が成功。SDKだけの独立したGitツリーを別ディレクトリへ取り出し、npm ci、SDKのfresh復元、C参照再ビルド、基盤test:allを確認した。C比較は両版とも10,107ケース、重複を除く10,082入力、各1,232,198文書照合で差分0。追加の有限候補照合は各1,781入力・68,576候補で成功した。npm packした配布物を別のTypeScriptプロジェクトへoffline導入し、型チェックとJS／Wasm GC／autoの検索・所有権・エラーを確認した。npm公開は行っていない。

検索コアはsrc/dictionary、src/romaji、src/pattern、src/migemo、薄い公開関数はsrc/exportsにある。src/featuresがGC構造体とJS String Builtinsを検査し、packages/mbmigemo/src/index.tsが選択したコアだけを遅延ロードする。空辞書を正常に受け取る場合と、破損をInvalidDictionaryで拒否する場合を区別する。接続プローブはsrc/bridgeへ移動した。

コミット4b3a7bbのGitHub Actions（run 34184453471）で、ubuntu-24.04／macos-15 × seed 20260908／104729の4構成すべてが成功。固定SDK・C参照の新規復元、test:all、packの別プロジェクトからの利用とfixturesの無変更を確認した。

M2終了時の残項目は実用辞書の固定と比較、実ブラウザ、性能・メモリと配布方式の判断だった。実用辞書とブラウザは上記M3/M4で検証した。

PBT追加後のtest:allは固定基盤18件、PBT6件、MoonBit各3件、接続固定4件とPBT2件の計36件が成功。seed 104729で通常PBTを各5,000回、合計30,000試行して成功した。保存した上流不具合のseed/pathによる再実行も成功。当時のAPI用PBTは生成辞書の候補保持・任意切断・二インスタンスの編集履歴を定義した段階で、本体接続と成功は上記M2で行った。

2026-09-08の最初のテスト基盤作成時点では、C/Migemoの固定ビルドと小辞書二種類、手書き・生成ケース、意味比較器、将来の公開API契約、両出力先の接続プローブ、Linux/macOS用CI定義が存在する。ローカルのtest:allは基盤15件、MoonBit各3件、接続4件が成功した。キャッシュとビルド結果を持ち込まない別ディレクトリでも、npm ci、C参照の新規取得とビルド、辞書生成、test:allの成功を確認した（MoonBit SDKは同じマシンの既存環境を使用）。この時点では検索コア、実用辞書、ブラウザ検証、ベンチマーク、公開パッケージはなかった。

テスト基盤作成直後のM1の残項目はSDKを新規環境に復元する経路とそのCI、実用辞書の選定だった。接続時の論理的なデータ実体化は説明できるが、エンジン内部の物理コピー数は未測定。2026-09-08にコミット1a92c08のGitHub Actionsを確認し、Linux/macOS × seed 20260908/104729の4構成すべてが成功した（run 34182583661）。当時はMoonBitのCI導入が未完了だった。実行手順と検証範囲はdocs/testing.mdに記録した。

M1以降の各段階が終わったら、利用できる機能、実際に実行した検証、残った問題、採用した出力先をこの節に追記する。


## Context and Orientation


このリポジトリの名前はmbmigemo。初期作成時のローカルルートは/workspace/scratch/f499f1cd06de/mbmigemoであり、以後の文中のパスとコマンドの作業ディレクトリはリポジトリのルートを基準にする。別の場所へcloneした場合は、そのルートを使う。

Migemoは、ローマ字入力を日本語の候補に展開し、その候補に一致する正規表現を生成する処理である。ここでいう「検索コア」はローマ字変換、辞書探索、正規表現生成までを指す。「接続処理」はコアとJSの間で文字列やバイト列を受け渡すコード。「基準実装」は比較対象に固定したC/Migemo。「前方一致」は入力が読みの先頭部分に一致する辞書項目も候補にする処理である。

辞書は読みから候補語を探せるバイナリデータとして持つ。jsmigemoのcompact dictionaryは小さい表現で木状の索引を持つ。木状の索引とは、読みの共通する先頭部分を共有して探索するデータ構造である。M1でバイナリの区画、整数の並び順、文字コード、索引のたどり方をdocs/dictionary-format.mdへ記録し、読み手が上流コードを調べ直さなくても実装できる状態にする。確認前に形式の詳細を推測で埋めない。

README.mdは目的と状態を示し、PLAN.mdは実装作業を管理する。docs/research/2026-09-08-moonbit-migemo.mdは判断の出発点を記録する。実装段階ではsrc/romaji/、src/dictionary/、src/pattern/、src/migemo/にMoonBitの処理を、src/exports/に公開用の薄い関数を置く。JS接続はpackages/mbmigemo/、試用画面はexamples/browser/、検証用データはtests/fixtures/、測定処理はbench/、ビルドとデータ準備はscripts/に置く。これらの実装ディレクトリは初期コミットには作らない。

MoonBitのStringはUTF-16のコード単位を基本に扱う。UTF-8の辞書の位置、UTF-16の位置、Unicodeの一文字を同じ単位として扱わない。BytesのJS表現はUint8Arrayに対応するが、一般の配列がすべてTypedArrayになるとは仮定しない。Wasm GCへの辞書投入でコピーが必要かはM1で調べる。


## Plan of Work


M1では、小さい接続実験と再現可能な評価環境を作る。MoonBit SDKの利用する版、Node.js、npm、依存パッケージを固定し、docs/toolchain.mdへ記録する。現在採用したSDKではmoon.modと各moon.pkgを使い、出力先をjsとwasm-gcとして明示する。既定の出力先に依存しない。package.jsonの検証用依存にjsmigemoを完全な版番号で追加し、package-lock.jsonも記録する。Node 26.0.0、npm 11.16.0、辞書変換用jsmigemo 0.5.2は固定済み。参照C/Migemoはtests/reference/lock.jsonのコミットとSHA-256から復元し、自動更新しない。

同時に、固定したjsmigemoのソースから辞書形式を読み取り、自作の小さい語彙をその形式に変換する手順を用意する。tests/fixtures/tiny-dict.tsvには「けんさく」から「検索」、「にほんご」から「日本語」を引ける項目を持たせる。元データ、変換器の版、生成物のSHA-256を記録する。SHA-256とは内容が同じか確認するための固定長のチェックサムである。実用辞書の取得元・版・利用条件もdocs/upstream.mdへ記録する。辞書形式と参照実装の版が決まったら、この計画にもその実際の値を追記する。

M1の接続実験では、文字列を往復させる関数と、入力バイト列の長さ・チェックサムを返す関数をJSとWasm GCの両方で動かす。ひらがな、半角カナ、補助平面の文字と、0・127・128・255を含むバイト列が壊れないことを確認する。補助平面の文字とはUTF-16で二つのコード単位を必要とする文字である。二つの辞書インスタンスが互いを上書きしないことも検証する。Wasm GCのインターフェースが難しい場合でもJS版の開発は継続し、接続実験の制限を記録する。M1終了時にはnpm run test:bridgeが成功し、実際の文字列・バイト列の受け渡し方法とコピー回数を説明できることを受け入れ条件とする。

M2では小さい辞書で検索コアを実装する。src/romaji/はローマ字から読み候補を作り、src/dictionary/は辞書バイト列を検証して前方一致の候補を列挙する。src/pattern/は候補をエスケープしてJavaScriptのRegExpで使えるパターンを作り、src/migemo/はそれらをつなぐ。辞書全体を毎問い合わせで作り直さない。索引はバイト列やオフセットを主体に読み、ノードごとの大量のオブジェクト化は必要性を測ってから行う。

M2の語彙と入力では、候補文書の集合へ照合した結果を基準実装と比較する。パターン文字列の差は診断値にする。参照自体のgolden変動検知のみ文字列の一致も要求する。共有接頭辞で候補をまとめるなど、等価な正規表現の改善を許容する。空入力は検索対象なしとして常に不一致となるパターン(?!)を返す。入力途中のn/nn、shi/si、促音、拗音、全角・半角の扱いは、固定した基準実装の結果からテストケースを作る。意図的に異なる空入力の契約は別ケースとして明示する。M2終了時にはmoon test --target jsとnpm run test:compat -- --fixture tiny --backend jsが成功し、kensakuから作ったパターンで「検索」を検索できることを確認する。

M3では実用辞書とJS公開APIを接続する。packages/mbmigemo/src/index.tsに非同期の初期化関数を置き、辞書をバイト列から受け取る。取得失敗と辞書形式不正を区別し、原因不明の空の辞書に置き換えない。辞書のURL取得は呼び出し側が行うため、ライブラリ自身に固定の配布URLを埋めない。実用辞書はscripts/prepare-dictionary.mjsで準備し、チェックサムが一致したものだけを測定に使う。

M3では固定した基準実装から、変換の境界を含む手書きケースと、固定シードの自動生成ケースを作る。固定シードとは毎回同じ疑似乱数列を作るための値で、初期値は20260908とする。入力と対象文書の集合はファイルに保存して再現できるようにする。examples/browser/ではkensaku、nihongoを入力し、元の日本語文書の一致箇所を確認できる小さい画面を作る。公開APIの辞書インスタンスごとの独立性も確認する。M3終了時にはnpm run test:compatとnpm run demoが使え、ブラウザで実用辞書を検索できることを受け入れる。

M4では同じコアのWasm GC版を公開する。src/exports/の関数は文字列の入力・出力と辞書インスタンスのハンドルを中心にする。ハンドルとはJS側が保持し、以後の問い合わせへ渡す不透明な参照である。内部の木やResult型をJSから直接解釈しない。辞書は初期化時にまとめて渡し、探索中に1バイトごとのJS呼び出しを行わない。

M4のJSラッパーはbackend: js、wasm-gc、autoの三つを受け付ける。autoでは必要なWasm GC機能とJS String Builtinsを小さい検証用モジュールで確認し、利用できなければJS版を読み込む。機能未対応以外の辞書破損や実装不具合は握りつぶさず報告する。Wasm GCを明示した場合は未対応をエラーにする。通常のinstantiateでJS String Builtinsが使えてもStreaming版では使えない環境があるため、ストリーミングを必須にしない。両版を先に取得せず、選択した版のみを遅延ロードする。M4終了時にはnpm run test:browserでJS強制、Wasm GC強制、機能未対応時のautoの動作を確認し、対応ブラウザと接続時のコピー量を記録する。

M5では容量と速度の評価を行う。主比較はC/Migemoとの意味互換性を確認したmbmigemoのJS版とWasm GC版とする。jsmigemoは任意の補助比較とし、一致集合が同じケースに限って速度を比較する。意味が異なるケースの速度を同等機能の結果として採用しない。C/Migemo自体は検索仕様の参照であり、native実行とブラウザ実行の速度を直接順位づけしない。入力、辞書の内容・形式、対象文書をそろえる。生成パターンの長さも保存し、候補数を減らして有利になった結果を採用しない。

測定では、実行コードと接続用JSの未圧縮・gzip・Brotli後のバイト数、辞書の同じ三種類のバイト数、取得から初回検索までの時間、取得後のコンパイルと辞書の初期化時間、展開時間の中央値・p95・p99、RegExpのコンパイル時間、同じ文書への照合時間を分ける。p95は測定値の95%が収まる値であり、平均だけでは見えない遅い問い合わせを確認する。メモリは各ブラウザで取得できる範囲と測定方法を明記し、同じ方法で測れない数値を直接順位づけしない。

M5では各対象のウォームアップ後に同じ入力を複数回走らせ、冷たい起動を別に測る。実機のCPU・OS・ブラウザ・SDK・辞書チェックサム・圧縮設定を結果に含める。初期判断の基準は、Wasm GC版が意味の互換性を満たし、コードと接続処理のBrotli合計または問い合わせp95のどちらかでJS版から20%以上改善し、かつ辞書取得後の初回応答を10%以上悪化させないこととする。これは性能の観測事実ではなく採用判断用の暫定値である。三回の独立した測定で方向がそろわなければ採用を保留する。基準を満たさなければJSを標準配布とし、Wasm GCは明示選択の実験版に留める。基準の変更は結果と理由をDecision Logへ記録する。

M6ではnpmへ送信せずnpm packで配布物を作り、別の小さいプロジェクトからJS版とWasm GC版を読み込む。型定義、辞書の供給方法、必要なブラウザ機能、エラー、実測結果、未対応範囲をREADMEに追記する。CIはコミットごとに必要な検証を実行する自動処理であり、GitHub ActionsでJSとWasm GCのビルド、互換性、ブラウザの接続テストを実行する。パッケージの公開やリポジトリのpublic化は、この実装計画の完了条件には含めない。


## Concrete Steps


現在成立するテスト基盤のコマンドは次のとおり。

    npm ci --ignore-scripts
    npm run reference:prepare
    npm run dictionary:prepare -- --fixture tiny
    npm test
    npm run test:pbt
    PBT_SEED=104729 npm run test:pbt:stress
    npm run test:all

npm testはNode/Cの基盤、test:allは記録したSDKでのMoonBitと接続も含む。test:apiとtest:compatはnpm run buildで作った本体を検証する。toolchain:prepare、build、pack:checkは実装済み。demo・browser・size・bench・test:releaseも実装済み。test:releaseは実用辞書とブラウザの準備後に全検証を実行する。作業ディレクトリはmbmigemoのリポジトリルートである。

最初に環境を確認し、結果をdocs/toolchain.mdに記録する。未導入のSDKをインストールする段階では、採用する版を固定してから作業する。

    git status --short
    moon version
    moonc -v
    node --version
    npm --version

scripts/prepare-dictionary.mjsとテスト用npm scripts、package-lock.jsonは作成済み。現在の接続実験はscripts/build-bridge.mjsで_build/に出力する。製品用scripts/build.mjsは実装済みで、型定義と両コア・ライセンスを生成する。再開時の依存復元はnpm ciを使う。ビルドスクリプトは、次のMoonBitコマンドを実行して出力をpackages/mbmigemo/dist/へ配置する。

    npm run moon -- check --target js
    npm run moon -- check --target wasm-gc
    npm run moon -- build --release --target js
    npm run moon -- build --release --target wasm-gc

M1が完成すると、次のコマンドで固定辞書の準備と両対象の接続実験が成功し、入力文字列とバイト列の一致を確認できる。

    npm ci
    npm run dictionary:prepare -- --fixture tiny
    npm run build
    npm run test:bridge

M2とM3では次を実行する。tinyでは小さい辞書、allでは固定した実用辞書も含めて比較する。test:compatは対象ケース数、比較した入力数、照合結果の不一致数を報告し、不一致があれば終了コード1、なければ0を返す。

    npm run moon -- test --target js
    npm run moon -- test --target wasm-gc
    npm run test:compat -- --fixture tiny --backend js
    npm run dictionary:prepare -- --fixture all
    npm run test:practical

M3でnpm run demoを用意し、ローカルのhttp://127.0.0.1:4173に試用画面を起動する。取得する辞書のチェックサム、選択中のバックエンドは開発用の確認情報として見られるようにする。kensakuの入力に対して「検索」が一致し、入力を消したら一致がなくなることを確認する。

    npm run demo

M4でブラウザテスト、M5で容量と時間の測定用コマンドを用意する。ブラウザテストはPlaywrightのChromium・Firefox・WebKitで行い、Safariの配布可否は実際のSafariでも確認する。テスト用WebKitをSafari実機と同一だとは扱わない。

    npm run browser:prepare
    npm run test:browser
    npm run size
    npm run bench
    npm run pack:check

npm run sizeは実行コード・接続用JS・辞書の各容量を出す。npm run benchはbench/results/へ生の測定結果を書き、選定に使う要約をdocs/benchmarks/baseline.mdへ転記する。npm run pack:checkはnpm packで作ったパッケージを一時プロジェクトで利用し、kensakuから「検索」を照合できることを確認する。いずれもnpm公開は行わない。


## Validation and Acceptance


検索の契約は「同じ辞書、入力、対象文書、正規表現フラグなら同じ一致結果になる」である。正規表現はJavaScriptのuフラグを付けて検証する。候補文書集合の先頭・中間・末尾に候補を埋め込む場合も比較する。正規表現の文字列の同一性は補助的な診断に使い、唯一の合否条件にしない。

tiny辞書でcreateMigemoを完了させ、query("kensaku")の結果からnew RegExp(pattern, "u")を作ると「検索」「けんさく」「ケンサク」が一致し、「無関係」が一致しない。query("")は(?!)を返し、空文字列も含めて何にも一致しない。メタ文字を含む入力がパターンの構文を破壊しない。n/nn、shi/si、促音、拗音、辞書にない語、長い入力、入力途中からの削除、全角・半角、濁点の表現、補助平面の文字を含むケースを固定した基準実装と比較する。

辞書が途中で切れている、索引が範囲外、文字列区画が不正、チェックサムが異なる、といった入力に対して準備処理または初期化が明示的に失敗する。空辞書で成功したことにしない。辞書準備時のチェックサム検証と、利用者が渡すバイト列の形式検証は区別する。二つのインスタンスに異なるtiny辞書を渡しても、問い合わせの結果が混ざらない。

JS版とWasm GC版は同じ互換性テストを通す。autoの機能未対応経路をテストで強制でき、選択した実装だけが取得される。Wasm GCを強制して未対応の場合はUnsupportedBackendを返し、autoの場合だけJSへ移る。辞書形式不正やコアの例外はautoでも成功に見せない。

実用辞書の互換性テストでは、固定した手書きケースに加え、シード20260908から作った少なくとも10,000件の入力を用いる。正規表現の長さ、候補集合の差、入力のクラスを失敗時に保存する。すべての有限テストが通っても、全入力について同値を証明したとは表現しない。

配布はM5の判断基準とM6の別プロジェクトからの読み込みで検証する。容量と速度の数字には辞書と接続コードを含む範囲を明示する。GCをホストへ任せる構成を、実行時メモリが無料になる仕組みとは説明しない。


## Idempotence and Recovery


辞書生成は固定した元データ・変換器・版から行い、再実行して同じチェックサムになるようにする。既存辞書を直接書き換えず、一時ファイルへ生成して検証後に置き換える。取得元が利用できなければ、検証済みのキャッシュを使用するか準備処理を失敗させ、別の辞書に黙って変更しない。

依存関係はnpm ciで再現し、SDK更新は独立したコミットで行う。更新後はJS・Wasm GCの接続と互換性を再検証する。失敗した試作は追記で制限を残し、動作中のJS経路を壊さずWasm GCの変更を切り戻せるようにする。

ベンチマークの生データとビルド生成物は無視対象の専用ディレクトリへ置く。人が書いたソース、fixtures、docsの要約を削除対象に含めない。リポジトリの履歴を強制的に書き換えて初期化し直さない。

新規リポジトリの作成が途中で止まった場合は、同名リポジトリの存在と内容を確認してから再開する。既存のREADMEやコミットがあれば読み、利用者の内容を上書きしない。


## Artifacts and Notes


初期コミットに含める文書はREADME.md、PLAN.md、docs/research/2026-09-08-moonbit-migemo.mdである。初期化時点ではMoonBit SDKとghコマンドはローカル環境に存在せず、検索コアのビルドや測定は行っていない。

実装が進んだら、docs/toolchain.mdへ使用した版、docs/upstream.mdへ参照実装と辞書の出所、docs/dictionary-format.mdへ読取仕様、docs/benchmarks/baseline.mdへ測定条件と採用判断を記録する。ベンチマークの数値だけを貼らず、その数値で配布方法をどう決めたかを残す。

公開APIの利用例は次のとおり。辞書URLは呼び出し側で用意し、現在の小辞書での実行例はREADMEに記録する。

    const bytes = new Uint8Array(await (await fetch("/migemo-compact-dict")).arrayBuffer());
    const migemo = await createMigemo({ dictionary: bytes, backend: "js" });
    const pattern = migemo.query("kensaku");
    new RegExp(pattern, "u").test("検索"); // true


## Interfaces and Dependencies


公開するJS APIの初期契約は次のとおり。これはTypeScriptの型として表現した設計であり、MoonBitの実在する関数シグネチャを引用したものではない。

    type Backend = "auto" | "js" | "wasm-gc";
    type MigemoOptions = {
      dictionary: Uint8Array;
      backend?: Backend;
    };
    interface Migemo {
      readonly backend: "js" | "wasm-gc";
      query(input: string): string;
    }
    function createMigemo(options: MigemoOptions): Promise<Migemo>;

backendを省略した場合は初期段階ではjsとする。M5でWasm GCを標準採用できたと判断した場合だけ、省略時をautoへ変更する。外部へ返すbackendは実際に動作している対象を示す。

初期化完了後は、呼び出し側が元のUint8Arrayを変更しても検索内容が変わらない契約とする。これを満たすためのコピーまたは辞書展開は初期化の測定に含める。queryは同期処理であり、UIを止めるほど重い場合はライブラリをWorkerの中から呼ぶ。WorkerとはUIの主処理とは別の実行場所であり、通信コストも含めて追加を判断する。初版でWorkerを必須にはしない。

初期化のエラーはUnsupportedBackend、InvalidDictionary、InitializationFailedに区別できるcodeを持つErrorで返す。問い合わせで内部エラーが起きた場合は例外として伝える。入力を勝手にtrim、正規化、候補切り捨てする処理は加えず、必要なものを互換性仕様として明記する。

実行時のコア依存はMoonBit標準ライブラリを中心にする。DOM、HTTP、正規表現エンジンをコアへ持ち込まない。開発時の検索基準にC/Migemo、compact辞書変換にjsmigemo、JSのテストにNode.js標準のテスト機能、ブラウザ検証にPlaywrightを使う。辞書はパッケージ本体に埋め込まず、利用者がバイト列として供給する。npm上の名前の確保や公開は別の作業であり、mbmigemoというリポジトリ名だけで利用可能だとは仮定しない。
