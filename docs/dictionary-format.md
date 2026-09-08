# jsmigemo 0.5.2 compact dictionary

2026-09-08に固定したnpm版の `dist/jsmigemo.mjs` 内のCompactDictionary、CompactDictionaryBuilder、CompactHiraganaString、LOUDSTrie、BitVectorから確認した。検索結果の基準はC/Migemo、mbmigemoへのバイナリ形式はjsmigemoのcompact形式とする。製品パーサはまだない。

## バイナリの並び

複数バイト整数はbig-endian。先頭マジック・形式バージョン・チェックサムは含まない。読みtrie、候補語trie、対応表の順に並び、区画間のパディングはない。

| trieの区画 | 表現 |
| --- | --- |
| edges件数 | 32bit整数、参照readerはsignedで読む |
| edges | 読みは1byte/要素、候補語はUTF-16BEの1コード単位/要素 |
| LOUDSビット数 | unsigned 32bit |
| LOUDSデータ | `ceil(bitCount / 64) * 8` バイト |

| 対応表の区画 | 表現 |
| --- | --- |
| 対応ビット数 | unsigned 32bit |
| 対応ビット列 | `ceil(bitCount / 64) * 8` バイト |
| index件数 | unsigned 32bit |
| 候補語trieのノードindex列 | signed 32bit/件 |

ビット列は64bitごとに上位32bit→下位32bitの順で格納する。ビット位置0はその64bitの最下位ビット。JSのreaderは各組を読み、Uint32Arrayには下位word→上位wordの順で入れ直す。

読みの1byte符号は0→U+0000、32..126→同じASCII、161..246→U+3041..U+3096、247→U+30FC。それ以外は不正。UTF-8ではない。候補語trieはUTF-16コード単位なので、𠮷や😀はそれぞれ二ノード分。逆引きではサロゲートペアを維持する。

## 木と対応表の探索

ノードは幅優先の番号。edges[0]はダミー、edges[1]がroot、edges[2]から実文字。兄弟の文字コードは昇順。LOUDSは先頭に1を持ち、各ノードについて0に続けて子の数だけ1を並べる。

rank(p,b)は位置pより前のbの数、select(k,b)はk番目（1始まり）のbの位置（0始まり）、nextClearBit(p)はp以降の最初の0の位置。

    parent(node) = rank(select(node, 1), 0)
    p = select(node, 0) + 1
    firstChild(node) = bit[p] == 1 ? rank(p, 1) + 1 : 子なし

子の連続区間から文字を二分探索する。前方一致は一致ノード自身と全子孫を列挙する。ノードの文字列はparentをrootまでたどり、edgesの列を逆順にする。

対応ビット列は読みノード1から順に「0、候補数ぶんの1」を並べる。読みノードkでは、p=select(k,0)、候補数=nextClearBit(p+1)-p-1、index列の開始位置=p-rank(p,0)。各indexを候補語trieで逆引きする。

最後の候補群の後に実体の0がない場合、nextClearBitの結果は論理ビット数として扱う必要がある。jsmigemo 0.5.2のreaderは、ビット数が64の倍数だとこの場合に-1を返して候補を失う。PBTで発見し、テスト用readerだけに終端補正を入れた。M2のパーサでもこの境界を扱う。詳細と再現例はdocs/testing.mdに記録している。

## 固定fixtureと形式検証

主辞書の実際の区画位置（バイト単位）。全長は489バイト。

| 内容 | 位置 | 値／長さ |
| --- | ---: | ---: |
| 読みedges件数 | 0 | 79 |
| 読みedges | 4 | 79バイト |
| 読みLOUDSビット数 | 83 | 156 |
| 読みLOUDS | 87 | 24バイト |
| 候補語edges件数 | 111 | 79 |
| 候補語edges | 115 | 158バイト |
| 候補語LOUDSビット数 | 273 | 156 |
| 候補語LOUDS | 277 | 24バイト |
| 対応ビット数 | 301 | 119 |
| 対応ビット列 | 305 | 16バイト |
| index件数 | 321 | 41 |
| index列 | 325 | 164バイト |

M2のパーサでは配列確保や探索より前に、整数・区画長・残りバイト・ノードindex・LOUDS構造を検証する。件数計算のオーバーフローや、範囲を越えるselect、親をたどるループを許さない。読み符号の不正、負の件数、範囲外index、全切断位置、余分な末尾バイトにはAPI契約テストで拒否を求める。

任意のバイト変更が必ず形式不正になるとは限らない。既知辞書のSHA-256検証は準備時の別検証とする。変換器が非対応の読みを黙って捨てるのを防ぐため、TSVの読みの符号範囲を事前検証し、変換後は全項目のexact lookupが同じ語彙へ戻ることを確認する。
