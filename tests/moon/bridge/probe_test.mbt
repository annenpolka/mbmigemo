///|
test "UTF-16 code units survive and differ from Unicode character count" {
  assert_eq(
    @bridge.echo("けんさくｶﾞ𠮷😀"),
    "けんさくｶﾞ𠮷😀",
  )
  assert_eq(@bridge.utf16_length("𠮷😀"), 4)
}

///|
test "snapshot contains unsigned bytes" {
  let source : Bytes = [0, 127, 128, 255]
  let owned = @bridge.snapshot_bytes(source)
  assert_eq(@bridge.byte_at(owned, 0), 0)
  assert_eq(@bridge.byte_at(owned, 1), 127)
  assert_eq(@bridge.byte_at(owned, 2), 128)
  assert_eq(@bridge.byte_at(owned, 3), 255)
  assert_eq(@bridge.byte_length(owned), 4)
}

///|
test "FNV-1a has a fixed independent known vector" {
  assert_eq(@bridge.checksum(b"hello"), 0x4f9f2cab)
  assert_eq(@bridge.checksum(b""), 0x811c9dc5)
}
