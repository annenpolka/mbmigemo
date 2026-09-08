///|
/// A validated compact dictionary. Nodes and mappings stay in flat arrays;
/// initialization never expands the dictionary into a graph of objects or words.
struct Dictionary {
  keys : Trie
  values : Trie
  mapping_starts : Array[Int]
  mappings : Array[Int]
}

///|
priv struct Trie {
  edges : Array[Int]
  first_child : Array[Int]
  child_limit : Array[Int]
  parents : Array[Int]
}

///|
priv struct Reader {
  data : Bytes
  mut cursor : Int
}

///|
/// All section lengths are bounded by the byte length before allocation. The
/// high bit is rejected because a MoonBit array cannot represent such a count.
fn Reader::count(self : Reader) -> Int? {
  if self.data.length() - self.cursor < 4 {
    return None
  }
  let p = self.cursor
  if self.data[p].to_int() >= 128 {
    return None
  }
  self.cursor += 4
  Some(
    (self.data[p].to_int() << 24) |
    (self.data[p + 1].to_int() << 16) |
    (self.data[p + 2].to_int() << 8) |
    self.data[p + 3].to_int(),
  )
}

///|
/// Each disk word is big-endian uint64, with logical bit zero at its low end.
fn bit(data : Bytes, offset : Int, position : Int) -> Bool {
  let byte_offset = offset + position / 64 * 8 + 7 - position % 64 / 8
  (data[byte_offset].to_int() & (1 << (position % 8))) != 0
}

///|
fn Reader::bits(self : Reader, size : Int) -> Int? {
  // Division before multiplication prevents size + 63 from overflowing.
  let words = size / 64 + (if size % 64 == 0 { 0 } else { 1 })
  if words > (self.data.length() - self.cursor) / 8 {
    return None
  }
  let start = self.cursor
  self.cursor += words * 8
  Some(start)
}

///|
fn compact_character(value : Int) -> Int? {
  if value == 0 || (value >= 32 && value <= 126) {
    Some(value)
  } else if value >= 161 && value <= 246 {
    Some(value + 0x3041 - 161)
  } else if value == 247 {
    Some(0x30fc)
  } else {
    None
  }
}

///|
fn Reader::trie(self : Reader, width : Int) -> Trie? {
  guard self.count() is Some(count) else { return None }
  if count < 2 || count > (self.data.length() - self.cursor) / width {
    return None
  }
  let edge_offset = self.cursor
  self.cursor += count * width
  guard self.count() is Some(bit_count) else { return None }
  // N real nodes have N zeroes and N ones, including the leading sentinel.
  // The upstream builder represents an empty input with just the sentinel,
  // omitting the root's zero. Both this and an explicit root-only trie are valid.
  let empty_trie = count == 2 && bit_count == 1
  // Avoid doubling an unchecked count from an untrusted file.
  if !empty_trie && (bit_count % 2 != 0 || bit_count / 2 != count - 1) {
    return None
  }
  guard self.bits(bit_count) is Some(bit_offset) else { return None }
  if !bit(self.data, bit_offset, 0) {
    return None
  }
  let edges = Array::make(count, 0)
  for i = 0; i < count; i = i + 1 {
    let p = edge_offset + i * width
    if width == 1 {
      guard compact_character(self.data[p].to_int()) is Some(code) else {
        return None
      }
      edges[i] = code
    } else {
      edges[i] = (self.data[p].to_int() << 8) | self.data[p + 1].to_int()
    }
  }
  let first_child = Array::make(count, 0)
  let child_limit = Array::make(count, 0)
  let parents = Array::make(count, 0)
  if empty_trie {
    first_child[1] = 2
    child_limit[1] = 2
    return Some({ edges, first_child, child_limit, parents, })
  }
  let mut position = 1
  let mut next_child = 2
  for node = 1; node < count; node = node + 1 {
    // A disconnected node must not acquire children and form a cycle.
    if node >= next_child ||
      position >= bit_count ||
      bit(self.data, bit_offset, position) {
      return None
    }
    position += 1
    first_child[node] = next_child
    let mut previous_edge = -1
    while position < bit_count && bit(self.data, bit_offset, position) {
      if next_child >= count || edges[next_child] <= previous_edge {
        return None
      }
      previous_edge = edges[next_child]
      parents[next_child] = node
      next_child += 1
      position += 1
    }
    child_limit[node] = next_child
  }
  if position != bit_count || next_child != count {
    return None
  }
  Some({ edges, first_child, child_limit, parents, })
}

///|
/// Parse the pinned jsmigemo compact format. Invalid bytes return None without
/// exposing a partly initialized dictionary. Arrays own every retained value.
pub fn parse(data : Bytes) -> Dictionary? {
  let reader = { data, cursor: 0, }
  guard reader.trie(1) is Some(keys) else { return None }
  guard reader.trie(2) is Some(values) else { return None }
  guard reader.count() is Some(mapping_bits) else { return None }
  guard reader.bits(mapping_bits) is Some(mapping_offset) else { return None }
  guard reader.count() is Some(mapping_count) else { return None }
  if mapping_bits < keys.edges.length() - 1 ||
    mapping_count != mapping_bits - (keys.edges.length() - 1) ||
    mapping_count > (data.length() - reader.cursor) / 4 ||
    mapping_count * 4 != data.length() - reader.cursor {
    return None
  }
  let mapping_starts = Array::make(keys.edges.length() + 1, 0)
  let mut position = 0
  let mut seen = 0
  for node = 1; node < keys.edges.length(); node = node + 1 {
    if position >= mapping_bits || bit(data, mapping_offset, position) {
      return None
    }
    mapping_starts[node] = seen
    position += 1
    // The logical end is the boundary even when no padding zero exists at
    // exactly 64, 128, or 192 bits. No out-of-range select is required.
    while position < mapping_bits && bit(data, mapping_offset, position) {
      seen += 1
      position += 1
    }
  }
  if position != mapping_bits || seen != mapping_count {
    return None
  }
  mapping_starts[keys.edges.length()] = seen
  let mappings = Array::make(mapping_count, 0)
  for i = 0; i < mapping_count; i = i + 1 {
    guard reader.count() is Some(index) else { return None }
    if index < 1 || index >= values.edges.length() {
      return None
    }
    mappings[i] = index
  }
  Some({ keys, values, mapping_starts, mappings, })
}

///|
fn Trie::lookup(self : Trie, prefix : String) -> Int? {
  let mut node = 1
  for i = 0; i < prefix.length(); i = i + 1 {
    let code = prefix.code_unit_at(i).to_int()
    let mut lower = self.first_child[node]
    let mut upper = self.child_limit[node]
    while lower < upper {
      let middle = lower + (upper - lower) / 2
      if self.edges[middle] < code {
        lower = middle + 1
      } else {
        upper = middle
      }
    }
    if lower == self.child_limit[node] || self.edges[lower] != code {
      return None
    }
    node = lower
  }
  Some(node)
}

///|
fn Trie::word(self : Trie, node : Int) -> String {
  let reversed : Array[Char] = []
  let mut current = node
  while current > 1 {
    // Edges are UTF-16 units, including both halves of an astral character.
    reversed.push(self.edges[current].unsafe_to_char())
    current = self.parents[current]
  }
  String::from_array(
    Array::makei(reversed.length(), i => reversed[reversed.length() - i - 1]),
  )
}

///|
/// Return values for every reading beginning with prefix. An empty prefix
/// enumerates all dictionary values; empty-query policy belongs to the caller.
/// A mapped value-trie root is a legitimate empty candidate, not corruption.
pub fn Dictionary::predictive_search(
  self : Dictionary,
  prefix : String,
) -> Array[String] {
  guard self.keys.lookup(prefix) is Some(start) else { return [] }
  let pending = [start]
  let result : Array[String] = []
  while pending.pop() is Some(node) {
    for i = self.mapping_starts[node]
        i < self.mapping_starts[node + 1]
        i = i + 1 {
      result.push(self.values.word(self.mappings[i]))
    }
    // Reverse-push preserves the ascending sibling order during traversal.
    for child = self.keys.child_limit[node] - 1
        child >= self.keys.first_child[node]
        child = child - 1 {
      pending.push(child)
    }
  }
  result
}
