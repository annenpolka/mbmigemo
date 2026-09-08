// Conversion and segmentation follow C/Migemo's romaji.c and migemo.c.
// Copyright (c) 2003-2026 MURAOKA Taro (KoRoN), MIT; see LICENSE-CMIGEMO.

///|
priv struct ConversionNode {
  children : Map[Int, Int]
  mut value : String?
  mut remain : String
}

///|
priv struct ConversionTable {
  nodes : Array[ConversionNode]
}

///|
fn make_table(entries : Array[(String, String, String)]) -> ConversionTable {
  let nodes : Array[ConversionNode] = [
    { children: Map([]), value: None, remain: "", },
  ]
  for entry in entries {
    let (key, value, remain) = entry
    let mut cursor = 0
    for i = 0; i < key.length(); i = i + 1 {
      let code = key.code_unit_at(i).to_int()
      let child = match nodes[cursor].children.get(code) {
        Some(child) => child
        None => {
          let child = nodes.length()
          nodes.push({ children: Map([]), value: None, remain: "", })
          nodes[cursor].children.set(code, child)
          child
        }
      }
      cursor = child
    }
    nodes[cursor].value = Some(value)
    nodes[cursor].remain = remain
  }
  { nodes, }
}

///|
/// Each substring carries one UTF-16 code unit so unmatched lone surrogates
/// remain unchanged on both backends. All frozen conversion keys are BMP.
fn unit_at(input : String, index : Int) -> String {
  input.unsafe_substring(start=index, end=index + 1)
}

///|
fn push_reverse(stack : Array[String], value : String) -> Unit {
  for i = value.length() - 1; i >= 0; i = i - 1 {
    stack.push(unit_at(value, i))
  }
}

///|
fn convert(table : ConversionTable, input : String) -> Array[String] {
  let output = StringBuilder()
  let pending : Array[String] = []
  let pushback : Array[String] = []
  let mut input_index = 0
  let mut node_index = 0
  while input_index < input.length() || !pushback.is_empty() {
    let token = match pushback.pop() {
      Some(token) => token
      None => {
        let token = unit_at(input, input_index)
        input_index = input_index + 1
        token
      }
    }
    match table.nodes[node_index].children.get(token.code_unit_at(0).to_int()) {
      None => {
        pending.push(token)
        output.write_string(pending[0])
        for i = pending.length() - 1; i > 0; i = i - 1 {
          pushback.push(pending[i])
        }
        pending.clear()
        node_index = 0
      }
      Some(next) => {
        node_index = next
        match table.nodes[next].value {
          Some(value) => {
            output.write_string(value)
            push_reverse(pushback, table.nodes[next].remain)
            pending.clear()
            node_index = 0
          }
          None => pending.push(token)
        }
      }
    }
  }
  let prefix = output.to_string()
  if pending.is_empty() {
    return [prefix]
  }
  // A partial suffix contributes every reachable terminal output, without
  // its pushback. For example, trailing n includes both な and ん.
  let result : Array[String] = []
  let seen : Map[String, Bool] = Map([])
  let visit = [node_index]
  while !visit.is_empty() {
    let index = visit.unsafe_pop()
    let node = table.nodes[index]
    match node.value {
      Some(value) => append_unique(result, seen, prefix + value)
      None => ()
    }
    for child in node.children.values() {
      visit.push(child)
    }
  }
  result
}

///|
fn append_unique(
  values : Array[String],
  seen : Map[String, Bool],
  value : String,
) -> Unit {
  if !seen.contains(value) {
    seen.set(value, true)
    values.push(value)
  }
}

///|
fn ascii_upper(code : Int) -> Bool {
  code >= 65 && code <= 90
}

///|
fn ascii_lower(input : String) -> String {
  let output = StringBuilder()
  for i = 0; i < input.length(); i = i + 1 {
    let code = input.code_unit_at(i).to_int()
    if ascii_upper(code) {
      output.write_string(unit_at("abcdefghijklmnopqrstuvwxyz", code - 65))
    } else {
      output.write_string(unit_at(input, i))
    }
  }
  output.to_string()
}

///|
/// Split at ASCII case boundaries, preserving whitespace and all code units.
/// A run beginning with two capitals continues until a non-uppercase ASCII
/// code unit; non-ASCII characters do not change that run's mode.
pub fn segment(input : String) -> Array[String] {
  let result : Array[String] = []
  let mut start = 0
  while start < input.length() {
    let upper_mode = ascii_upper(input.code_unit_at(start).to_int()) &&
      start + 1 < input.length() &&
      ascii_upper(input.code_unit_at(start + 1).to_int())
    let mut end = start + 1
    while end < input.length() {
      let code = input.code_unit_at(end).to_int()
      if code < 128 && ascii_upper(code) != upper_mode {
        break
      }
      end = end + 1
    }
    result.push(input.unsafe_substring(start~, end~))
    start = end
  }
  result
}

///|
/// Emitted literals and dictionary readings are different in C/Migemo:
/// only lowercase input, hiragana, and katakana get dictionary lookups.
pub struct Expansion {
  candidates : Array[String]
  readings : Array[String]
}

///|
pub fn expand(word : String) -> Expansion {
  let candidates : Array[String] = []
  let candidate_set : Map[String, Bool] = Map([])
  let readings : Array[String] = []
  let reading_set : Map[String, Bool] = Map([])
  let lower = ascii_lower(word)
  append_unique(candidates, candidate_set, word)
  append_unique(readings, reading_set, lower)
  for value in convert(han2zen, word) {
    append_unique(candidates, candidate_set, value)
  }
  for value in convert(zen2han, word) {
    append_unique(candidates, candidate_set, value)
  }
  for hira in convert(roma2hira, lower) {
    append_unique(candidates, candidate_set, hira)
    append_unique(readings, reading_set, hira)
    for kata in convert(hira2kata, hira) {
      append_unique(candidates, candidate_set, kata)
      append_unique(readings, reading_set, kata)
      for han in convert(zen2han, kata) {
        append_unique(candidates, candidate_set, han)
      }
    }
  }
  { candidates, readings, }
}
