///|
/// Test-only bridge probe; no search implementation or production ABI.
pub fn echo(value : String) -> String {
  value
}

///|
pub fn utf16_length(value : String) -> Int {
  value.length()
}

///|
pub fn snapshot_bytes(value : Bytes) -> Bytes {
  Bytes::makei(value.length(), i => value[i])
}

///|
/// Wasm GC prototype: each JS string code unit carries one input byte.
/// This is a measured copy path, not a commitment to the final dictionary ABI.
pub fn snapshot_latin1(value : String) -> Bytes {
  Bytes::makei(value.length(), i => value.code_unit_at(i).to_int().to_byte())
}

///|
pub fn byte_length(value : Bytes) -> Int {
  value.length()
}

///|
pub fn byte_at(value : Bytes, index : Int) -> Int {
  value[index].to_int()
}

///|
pub fn checksum(value : Bytes) -> UInt {
  let mut hash : UInt = 2166136261
  for i = 0; i < value.length(); i = i + 1 {
    hash = (hash ^ value[i].to_int().reinterpret_as_uint()) * 16777619
  }
  hash
}
