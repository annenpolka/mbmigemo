///|
test "ASCII phrase boundaries preserve spaces and non-ASCII text" {
  assert_eq(segment(""), [])
  assert_eq(segment("fooBARbaz"), ["foo", "BAR", "baz"])
  assert_eq(segment("KensakuNihongo"), ["Kensaku", "Nihongo"])
  assert_eq(segment("AB日本CDx"), ["AB日本CD", "x"])
  assert_eq(segment("A日本CDx"), ["A日本", "CD", "x"])
  assert_eq(segment("foo bar\nBaz"), ["foo bar\n", "Baz"])
  assert_eq(segment("AB\u0000cd"), ["AB", "\u0000cd"])
}

///|
test "lowercase conversion does not change Unicode text" {
  assert_eq(ascii_lower("ABCÀＺ日本😀"), "abcÀＺ日本😀")
}

///|
test "complete romaji aliases and pushback" {
  assert_eq(convert(roma2hira, "kensaku"), ["けんさく"])
  assert_eq(convert(roma2hira, "shi"), ["し"])
  assert_eq(convert(roma2hira, "si"), ["し"])
  assert_eq(convert(roma2hira, "ti"), ["ち"])
  assert_eq(convert(roma2hira, "tu"), ["つ"])
  assert_eq(convert(roma2hira, "gakkou"), ["がっこう"])
  assert_eq(convert(roma2hira, "matcha"), ["まっちゃ"])
  assert_eq(convert(roma2hira, "nn"), ["ん"])
  assert_eq(convert(roma2hira, "nna"), ["んあ"])
  assert_eq(convert(roma2hira, "n'ya"), ["んや"])
  assert_eq(convert(roma2hira, "mma"), ["っま"])
}

///|
test "partial syllables enumerate terminal outputs without pushback" {
  let n = convert(roma2hira, "n")
  assert_true(n.contains("な"))
  assert_true(n.contains("にゃ"))
  assert_true(n.contains("ん"))
  assert_false(n.contains("んb"))
  let ken = convert(roma2hira, "ken")
  assert_true(ken.contains("けな"))
  assert_true(ken.contains("けん"))
  let kk = convert(roma2hira, "kk")
  assert_true(kk.contains("っか"))
  assert_true(kk.contains("っっ"))
}

///|
test "failed trie paths retry all pending input" {
  assert_eq(convert(roma2hira, "szx?"), ["szx?"])
  assert_eq(convert(roma2hira, "k?sa"), ["k?さ"])
  assert_eq(convert(roma2hira, "\u0000n'😀"), ["\u0000ん😀"])
  assert_eq(convert(roma2hira, " A \n"), [" A \n"])
}

///|
test "unmatched UTF-16 code units survive every conversion stage" {
  let high = unit_at("😀", 0)
  let low = unit_at("😀", 1)
  for input in [high, low, high + "\u0000" + low, "a" + high + "b"] {
    assert_eq(convert(han2zen, input).length(), 1)
    assert_eq(convert(hira2kata, input), [input])
    assert_eq(convert(zen2han, input), [input])
    assert_true(expand(input).candidates.contains(input))
    assert_eq(segment(input), [input])
  }
}

///|
test "width conversion follows frozen mappings without normalizing input" {
  assert_eq(convert(han2zen, "abc123#"), ["ａｂｃ１２３＃"])
  assert_eq(convert(han2zen, "ｶﾞ"), ["カ゛"])
  assert_eq(convert(zen2han, "ガ"), ["ｶﾞ"])
  assert_eq(convert(hira2kata, "がっこう"), ["ガッコウ"])
  assert_eq(convert(han2zen, " "), [" "])
  assert_eq(convert(han2zen, "か\u3099"), ["か\u3099"])
}

///|
test "lookup readings exclude direct width-only candidates" {
  let result = expand("Kensaku")
  assert_true(result.candidates.contains("Kensaku"))
  assert_true(result.candidates.contains("Ｋｅｎｓａｋｕ"))
  assert_true(result.candidates.contains("けんさく"))
  assert_true(result.candidates.contains("ケンサク"))
  assert_true(result.candidates.contains("ｹﾝｻｸ"))
  assert_eq(result.readings, ["kensaku", "けんさく", "ケンサク"])
  assert_false(result.candidates.contains("kensaku"))
  let half = expand("ｶﾞ")
  assert_true(half.candidates.contains("カ゛"))
  assert_false(half.readings.contains("カ゛"))
}
