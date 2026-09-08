///|
test "metacharacters are escaped without invalid Unicode identity escapes" {
  assert_eq(
    @pattern.escape_literal("a.b+[x](y)|^$\\{}?*-/"),
    "a\\.b\\+\\[x\\]\\(y\\)\\|\\^\\$\\\\\\{\\}\\?\\*-/",
  )
  assert_eq(
    @pattern.escape_literal("\u0000\t\r\n𠮷ｶﾞ"),
    "\\x00\\t\\r\\n𠮷ｶﾞ",
  )
}

///|
test "candidate boundaries and deduplication preserve whole words" {
  assert_eq(
    @pattern.alternatives(["検索", "𠮷", "検索", "a|b"]),
    "(?:a\\|b|検索|𠮷)",
  )
  assert_eq(@pattern.alternatives([]), "(?!)")
}

///|
test "accepted prefixes stop before segment concatenation" {
  assert_eq(
    @pattern.alternatives(["検索機", "検索", "研削"]),
    "(?:検索|研削)",
  )
  assert_eq(@pattern.alternatives(["abc", "", "def"]), "(?:)")
}

///|
test "lone surrogate does not suppress a complete supplementary literal" {
  let high = "😀".unsafe_substring(start=0, end=1)
  assert_eq(
    @pattern.alternatives([high, "😀", "😀x"]),
    "(?:" + high + "|😀)",
  )
}
