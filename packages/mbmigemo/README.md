# mbmigemo

MoonBitの共通コアからJavaScript／Wasm GCへ出力するMigemoライブラリ。ローマ字から日本語に一致する正規表現を生成する。現在は開発用のローカル配布物で、npmには公開していない。

```ts
import { createMigemo } from 'mbmigemo';

const response = await fetch('/migemo-compact-dict');
if (!response.ok) throw new Error(`Dictionary HTTP ${response.status}`);
const dictionary = new Uint8Array(await response.arrayBuffer());
const migemo = await createMigemo({ dictionary, backend: 'js' });
new RegExp(migemo.query('kensaku'), 'u').test('検索'); // true
```

辞書はjsmigemoのcompact dictionary形式の`Uint8Array`で渡す。取得先と利用条件は呼び出し側で決める。初期化時に内容を取り込み、元配列を変更しても結果は変わらない。辞書の破損は`InvalidDictionary`で拒否する。

`createMigemo`は非同期、初期化後の`query(input: string): string`は同期。空入力は常に不一致の`(?!)`になり、空白やUnicodeを勝手に正規化しない。文書の照合は呼び出し側の`RegExp`で行う。大量の文書や大きな展開を扱う場合はWorker内でも利用できる。

`backend`は`js`（既定）、`wasm-gc`、`auto`。固定環境での実測に基づき、Wasm GCは利用者が選択できる実験版としている。Wasm版にはWasm GCとJS String Builtinsの両方が必要で、明示した方式が未対応なら`UnsupportedBackend`になる。`auto`は機能未対応時にJSを選ぶ。配布物の読み込み失敗や破損をfallbackで隠さず、`InitializationFailed`として返す。エラーは`MigemoError`の`code`で判別できる。インスタンスの`backend`は実際に選んだ方式を返す。

ブラウザへ配置するときは`dist/`内の相対位置を維持し、`.wasm`を`application/wasm`で配信する。選択したコアを遅延ロードするため、そのファイルも配信対象に含める。

検証手順、辞書の準備、実測値は[ソースリポジトリ](https://github.com/annenpolka/mbmigemo)を参照。プロジェクトのライセンスはMIT（`LICENSE`）。上流由来のコードには同梱の`THIRD_PARTY_NOTICES.md`と`dist/LICENSE-*`・`dist/NOTICE-*`が適用される。辞書は同梱しない。
