///|
/// Escape code units without decoding or normalizing the original string.
/// Outside character classes, identity escapes such as \\- are invalid in /u.
pub fn escape_literal(input : String) -> String {
  let result = StringBuilder()
  for i = 0; i < input.length(); i = i + 1 {
    let unit = input.code_unit_at(i).to_int()
    match unit {
      0 => result.write_string("\\x00")
      9 => result.write_string("\\t")
      10 => result.write_string("\\n")
      13 => result.write_string("\\r")
      36 | 40 | 41 | 42 | 43 | 46 | 63 | 91 | 92 | 93 | 94 | 123 | 124 | 125 => {
        result.write_string("\\")
        result.write_string(input.unsafe_substring(start=i, end=i + 1))
      }
      _ => result.write_string(input.unsafe_substring(start=i, end=i + 1))
    }
  }
  result.to_string()
}

///|
/// A /u literal cannot end halfway through a surrogate pair. Lone surrogates
/// remain distinct from the supplementary characters sharing that code unit.
fn accepted_prefix(prefix : String, candidate : String) -> Bool {
  if !candidate.has_prefix(prefix[:]) {
    return false
  }
  let end = prefix.length()
  if end > 0 && end < candidate.length() {
    let before = candidate.code_unit_at(end - 1).to_int()
    let after = candidate.code_unit_at(end).to_int()
    if before >= 0xd800 &&
      before <= 0xdbff &&
      after >= 0xdc00 &&
      after <= 0xdfff {
      return false
    }
  }
  true
}

///|
/// C/Migemo's regex trie stops at an accepted term even when it has children.
/// Apply this per segment, before concatenation: retaining 検索機 beside 検索
/// would incorrectly allow 検索機Nihongo for the query KensakuNihongo.
/// There is no heuristic length/count cap; this is the reference's semantics.
pub fn alternatives(candidates : Array[String]) -> String {
  let ordered = candidates.copy()
  // The default String Compare is length-first in the pinned core.
  ordered.sort_by((left, right) => left.lexical_compare(right))
  let result = StringBuilder()
  result.write_string("(?:")
  let mut previous : String? = None
  let mut count = 0
  for candidate in ordered {
    if previous is Some(prefix) && accepted_prefix(prefix, candidate) {
      continue
    }
    if count > 0 {
      result.write_string("|")
    }
    result.write_string(escape_literal(candidate))
    previous = Some(candidate)
    count = count + 1
  }
  result.write_string(")")
  if count == 0 {
    "(?!)"
  } else {
    result.to_string()
  }
}
