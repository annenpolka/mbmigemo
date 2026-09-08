///|
/// Opaque GC values cross two exports, preventing allocation elimination.
pub struct Box {
  text : String
}

///|
pub fn create(input : String) -> Box {
  { text: input, }
}

///|
pub fn read(box : Box) -> String {
  box.text + "!"
}
