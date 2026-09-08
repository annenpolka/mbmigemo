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
  assert_eq(@pattern.alternatives([high, "😀", "😀x"]), "(?:[\\ud83d😀])")
}

///|
test "shared prefixes and terminal characters factor without losing branches" {
  assert_eq(
    @pattern.alternatives(["ax", "ay", "az", "bx", "by"]),
    "(?:a[xyz]|b[xy])",
  )
  assert_eq(
    @pattern.alternatives(["aa", "ab", "ac", "axx"]),
    "(?:a(?:xx|[abc]))",
  )
  assert_eq(
    @pattern.alternatives(["abx", "aby", "acx", "abxy"]),
    "(?:a(?:b[xy]|cx))",
  )
}

///|
test "character classes escape punctuation and unmatched surrogate leaves" {
  let high = "😀".unsafe_substring(start=0, end=1)
  let low = "😀".unsafe_substring(start=1, end=2)
  assert_eq(
    @pattern.alternatives([high, low, "😀"]),
    "(?:[\\ud83d\\ude00😀])",
  )
  assert_eq(
    @pattern.alternatives(["-", "]", "[", "^", "\\", "\u0000"]),
    "(?:[\\x00\\x2d\\[\\\\\\]\\^])",
  )
}

///|
test "astral edges cannot split a shared unmatched surrogate prefix" {
  let high = "😀".unsafe_substring(start=0, end=1)
  assert_eq(
    @pattern.alternatives([high + "a", "😀", high + "\ue000"]),
    "(?:" + high + "[a\ue000]|😀)",
  )
}

///|
test "a long one-child chain stays flat instead of nesting a group per character" {
  let prefix = String::make(8192, 'a')
  assert_eq(
    @pattern.alternatives([prefix + "x", prefix + "y"]),
    "(?:" + prefix + "[xy])",
  )
}
