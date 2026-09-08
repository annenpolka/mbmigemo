///|
/// An opaque instance crosses the host boundary. JS never interprets Result,
/// Option, or the internal dictionary representation.
pub struct Instance {
  dictionary : @dictionary.Dictionary?
}

///|
pub fn initialize(bytes : Bytes) -> Instance {
  { dictionary: @dictionary.parse(bytes), }
}

///|
pub fn initialize_latin1(bytes : String) -> Instance {
  let data = Bytes::makei(bytes.length(), i => {
    bytes.code_unit_at(i).to_int().to_byte()
  })
  initialize(data)
}

///|
pub fn is_valid(instance : Instance) -> Bool {
  instance.dictionary is Some(_)
}

///|
pub fn query(instance : Instance, input : String) -> String {
  match instance.dictionary {
    Some(dictionary) => @migemo.query(dictionary, input)
    None => abort("Query on an invalid dictionary instance")
  }
}
