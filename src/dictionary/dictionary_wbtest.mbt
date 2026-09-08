///|
fn append_count(out : Array[Byte], value : Int) -> Unit {
  out.push(((value >> 24) & 255).to_byte())
  out.push(((value >> 16) & 255).to_byte())
  out.push(((value >> 8) & 255).to_byte())
  out.push((value & 255).to_byte())
}

///|
fn append_bits(out : Array[Byte], bits : Array[Int]) -> Unit {
  append_count(out, bits.length())
  let words = bits.length() / 64 + (if bits.length() % 64 == 0 { 0 } else { 1 })
  for word = 0; word < words; word = word + 1 {
    for byte = 7; byte >= 0; byte = byte - 1 {
      let mut value = 0
      for b = 0; b < 8; b = b + 1 {
        let p = word * 64 + byte * 8 + b
        if p < bits.length() && bits[p] == 1 {
          value = value | (1 << b)
        }
      }
      out.push(value.to_byte())
    }
  }
}

///|
fn append_trie(
  out : Array[Byte],
  edges : Array[Int],
  width : Int,
  louds : Array[Int],
) -> Unit {
  append_count(out, edges.length())
  for edge in edges {
    if width == 2 {
      out.push((edge >> 8).to_byte())
    }
    out.push((edge & 255).to_byte())
  }
  append_bits(out, louds)
}

///|
/// Hand-specified BFS topology, independent of the parser and upstream builder:
/// a -> A, 😀; ab -> A😀; b -> 😀. Each astral value occupies two trie nodes.
fn sample() -> Bytes {
  let out : Array[Byte] = []
  append_trie(out, [32, 32, 97, 98, 98], 1, [1, 0, 1, 1, 0, 1, 0, 0])
  append_trie(out, [32, 32, 65, 0xd83d, 0xd83d, 0xde00, 0xde00], 2, [
    1, 0, 1, 1, 0, 1, 0, 1, 0, 1, 0, 0,
  ])
  append_bits(out, [0, 0, 1, 1, 0, 1, 0, 1])
  append_count(out, 4)
  for index in [2, 5, 5, 6] {
    append_count(out, index)
  }
  Bytes::from_array(out)
}

///|
test "prefix traversal preserves shared prefixes, duplicates, and astral UTF-16" {
  guard parse(sample()) is Some(dictionary) else {
    abort("valid fixture rejected")
  }
  let a = dictionary.predictive_search("a")
  a.sort()
  let expected_a = ["A", "A😀", "😀"]
  expected_a.sort()
  assert_eq(a, expected_a)
  assert_eq(dictionary.predictive_search("ab"), ["A😀"])
  assert_eq(dictionary.predictive_search("b"), ["😀"])
  assert_eq(dictionary.predictive_search("abc"), [])
  assert_eq(dictionary.predictive_search("😀"), [])
  let all = dictionary.predictive_search("")
  all.sort()
  let expected_all = ["A", "A😀", "😀", "😀"]
  expected_all.sort()
  assert_eq(all, expected_all)
}

///|
test "every proper prefix and trailing data is rejected" {
  let valid = sample()
  for length = 0; length < valid.length(); length = length + 1 {
    let truncated = Bytes::makei(length, i => valid[i])
    assert_eq(parse(truncated) is None, true)
  }
  let trailing = Bytes::makei(valid.length() + 1, i => {
    if i < valid.length() {
      valid[i]
    } else {
      0
    }
  })
  assert_eq(parse(trailing) is None, true)
}

///|
fn replace_byte(data : Bytes, offset : Int, value : Byte) -> Bytes {
  Bytes::makei(data.length(), i => if i == offset { value } else { data[i] })
}

///|
test "counts, characters, sibling order, topology, and value indices are checked" {
  let valid = sample()
  assert_eq(valid.length(), 83)
  // count offsets: key 0, value 21, mapping 63. Bit data: key 13, mapping 55.
  for offset in [0, 21, 63] {
    for high in [0x7f, 0xff] {
      assert_eq(
        parse(replace_byte(valid, offset, high.to_byte())) is None,
        true,
      )
    }
  }
  assert_eq(parse(replace_byte(valid, 6, 0xff)) is None, true)
  assert_eq(parse(replace_byte(valid, 7, 97)) is None, true)
  assert_eq(parse(replace_byte(valid, 20, 0)) is None, true)
  // Same node/bit counts, but a disconnected third node: 1,0,1,0,0,1,1,0.
  assert_eq(parse(replace_byte(valid, 20, 0x65)) is None, true)
  // Mapping must begin with the root's zero delimiter.
  assert_eq(parse(replace_byte(valid, 62, 0xad)) is None, true)
  for invalid_index in [0, 7, 255] {
    assert_eq(
      parse(replace_byte(valid, 70, invalid_index.to_byte())) is None,
      true,
    )
  }
  assert_eq(parse(replace_byte(valid, 67, 0xff)) is None, true)
}

///|
test "the final mapping group survives exact 64-bit boundaries without padding" {
  for candidate_count in [61, 62, 63, 126, 190] {
    let out : Array[Byte] = []
    append_trie(out, [32, 32, 97], 1, [1, 0, 1, 0])
    append_trie(out, [32, 32, 118], 2, [1, 0, 1, 0])
    let mapping = [0, 0]
    for i = 0; i < candidate_count; i = i + 1 {
      mapping.push(1)
    }
    append_bits(out, mapping)
    append_count(out, candidate_count)
    for i = 0; i < candidate_count; i = i + 1 {
      append_count(out, 2)
    }
    guard parse(Bytes::from_array(out)) is Some(dictionary) else {
      abort("valid boundary fixture rejected")
    }
    assert_eq(
      dictionary.predictive_search("a"),
      Array::make(candidate_count, "v"),
    )
  }
}

///|
test "long reading traverses iteratively without recursive nodes" {
  let depth = 4096
  let edges = [32, 32]
  let louds = [1]
  let mapping = [0]
  for i = 0; i < depth; i = i + 1 {
    edges.push(97)
    louds.push(0)
    louds.push(1)
    mapping.push(0)
  }
  louds.push(0)
  mapping.push(1)
  let out : Array[Byte] = []
  append_trie(out, edges, 1, louds)
  append_trie(out, [32, 32, 118], 2, [1, 0, 1, 0])
  append_bits(out, mapping)
  append_count(out, 1)
  append_count(out, 2)
  guard parse(Bytes::from_array(out)) is Some(dictionary) else {
    abort("valid long reading rejected")
  }
  assert_eq(dictionary.predictive_search("a"), ["v"])
  assert_eq(dictionary.predictive_search(String::make(depth, 'a')), ["v"])
  assert_eq(dictionary.predictive_search(String::make(depth + 1, 'a')), [])
}

///|
test "canonical empty dictionary is valid and has no candidates" {
  let out : Array[Byte] = []
  append_trie(out, [32, 32], 1, [1])
  append_trie(out, [32, 32], 2, [1])
  append_bits(out, [0])
  append_count(out, 0)
  let bytes = Bytes::from_array(out)
  assert_eq(bytes.length(), 54)
  guard parse(bytes) is Some(dictionary) else {
    abort("empty dictionary rejected")
  }
  assert_eq(dictionary.predictive_search(""), [])
  assert_eq(dictionary.predictive_search("a"), [])
  assert_eq(dictionary.predictive_search("けんさく"), [])
}

///|
test "NUL and lone surrogate values are UTF-16 units, not malformed encodings" {
  for code in [0, 0xd800, 0xdc00, 0xffff] {
    let out : Array[Byte] = []
    append_trie(out, [32, 32, 0], 1, [1, 0, 1, 0])
    append_trie(out, [32, 32, code], 2, [1, 0, 1, 0])
    append_bits(out, [0, 0, 1])
    append_count(out, 1)
    append_count(out, 2)
    guard parse(Bytes::from_array(out)) is Some(dictionary) else {
      abort("valid code unit rejected")
    }
    assert_eq(dictionary.predictive_search("\u0000"), [
      String::from_array([code.unsafe_to_char()]),
    ])
  }
}

///|
test "explicit root mapping represents an empty reading or an empty value" {
  // The format can encode empty entries even though the TSV preparation helper
  // rejects them. The parser does not silently impose that producer's policy.
  let empty_reading : Array[Byte] = []
  append_trie(empty_reading, [32, 32], 1, [1, 0])
  append_trie(empty_reading, [32, 32, 118], 2, [1, 0, 1, 0])
  append_bits(empty_reading, [0, 1])
  append_count(empty_reading, 1)
  append_count(empty_reading, 2)
  guard parse(Bytes::from_array(empty_reading)) is Some(dictionary) else {
    abort("empty reading rejected")
  }
  assert_eq(dictionary.predictive_search(""), ["v"])
  assert_eq(dictionary.predictive_search("a"), [])

  let empty_value : Array[Byte] = []
  append_trie(empty_value, [32, 32, 97], 1, [1, 0, 1, 0])
  append_trie(empty_value, [32, 32], 2, [1, 0])
  append_bits(empty_value, [0, 0, 1])
  append_count(empty_value, 1)
  append_count(empty_value, 1)
  guard parse(Bytes::from_array(empty_value)) is Some(dictionary) else {
    abort("empty value rejected")
  }
  assert_eq(dictionary.predictive_search("a"), [""])
}
