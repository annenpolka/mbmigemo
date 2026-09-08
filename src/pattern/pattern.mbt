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
/// Keep valid surrogate pairs on one edge, but preserve unmatched code units.
fn point_at(input : String, index : Int) -> (Int, Int) {
  let first = input.code_unit_at(index).to_int()
  if first >= 0xd800 && first <= 0xdbff && index + 1 < input.length() {
    let second = input.code_unit_at(index + 1).to_int()
    if second >= 0xdc00 && second <= 0xdfff {
      return (0x10000 + (first - 0xd800) * 1024 + second - 0xdc00, 2)
    }
  }
  (first, 1)
}

///|
/// UTF-16 order can put an astral edge between two unmatched-high-surrogate
/// edges. Code point order keeps every child range contiguous for factoring.
fn compare_points(left : String, right : String) -> Int {
  let mut index = 0
  while index < left.length() && index < right.length() {
    let (a, width) = point_at(left, index)
    let (b, _) = point_at(right, index)
    if a != b {
      return a - b
    }
    index += width
  }
  left.length() - right.length()
}

///|
/// Adjacent unmatched high/low surrogate leaves must not join into one astral
/// character when their spellings are placed next to each other in a class.
fn escape_class(input : String) -> String {
  let (point, _) = point_at(input, 0)
  if point >= 0xd800 && point <= 0xdfff {
    "\\u" + point.to_string(radix=16)
  } else if point == 45 {
    "\\x2d"
  } else {
    escape_literal(input)
  }
}

///|
priv enum RenderTask {
  Text(String)
  Range(Int, Int, Int, Bool)
}

///|
/// The sorted range is a compressed trie: its first and last words determine
/// the common prefix, and adjacent equal code points determine child ranges.
/// Render with an explicit stack so long strings never consume the call stack.
fn render_trie(words : Array[String]) -> String {
  let output = StringBuilder()
  output.write_string("(?:")
  let pending : Array[RenderTask] = [
    Text(")"),
    Range(0, words.length(), 0, true),
  ]
  while pending.pop() is Some(task) {
    match task {
      Text(text) => output.write_string(text)
      Range(start, end, offset, enclosed) => {
        let first = words[start]
        if end - start == 1 {
          output.write_string(
            escape_literal(
              first.unsafe_substring(start=offset, end=first.length()),
            ),
          )
          continue
        }
        let last = words[end - 1]
        let mut common = offset
        while common < first.length() && common < last.length() {
          let (left, width) = point_at(first, common)
          let (right, _) = point_at(last, common)
          if left != right {
            break
          }
          common += width
        }
        output.write_string(
          escape_literal(first.unsafe_substring(start=offset, end=common)),
        )
        let branches : Array[RenderTask] = []
        let leaves : Array[String] = []
        let mut cursor = start
        while cursor < end {
          let (point, width) = point_at(words[cursor], common)
          let mut limit = cursor + 1
          while limit < end {
            let (next, _) = point_at(words[limit], common)
            if point != next {
              break
            }
            limit += 1
          }
          if limit - cursor == 1 && words[cursor].length() == common + width {
            leaves.push(
              words[cursor].unsafe_substring(start=common, end=common + width),
            )
          } else {
            branches.push(Range(cursor, limit, common, false))
          }
          cursor = limit
        }
        if leaves.length() == 1 {
          branches.push(Text(escape_literal(leaves[0])))
        } else if leaves.length() > 1 {
          let characters = StringBuilder()
          characters.write_string("[")
          for leaf in leaves {
            characters.write_string(escape_class(leaf))
          }
          characters.write_string("]")
          branches.push(Text(characters.to_string()))
        }
        if branches.length() > 1 && (!enclosed || common > offset) {
          output.write_string("(?:")
          pending.push(Text(")"))
        }
        for index = branches.length() - 1; index >= 0; index = index - 1 {
          pending.push(branches[index])
          if index > 0 {
            pending.push(Text("|"))
          }
        }
      }
    }
  }
  output.to_string()
}

///|
/// C/Migemo's regex trie stops at an accepted term even when it has children.
/// Apply this per segment, before concatenation: retaining 検索機 beside 検索
/// would incorrectly allow 検索機Nihongo for the query KensakuNihongo.
/// There is no heuristic length/count cap; this is the reference's semantics.
pub fn alternatives(candidates : Array[String]) -> String {
  let ordered = candidates.copy()
  ordered.sort_by(compare_points)
  let accepted : Array[String] = []
  let mut previous : String? = None
  for candidate in ordered {
    if previous is Some(prefix) && accepted_prefix(prefix, candidate) {
      continue
    }
    accepted.push(candidate)
    previous = Some(candidate)
  }
  if accepted.is_empty() {
    "(?!)"
  } else {
    render_trie(accepted)
  }
}
