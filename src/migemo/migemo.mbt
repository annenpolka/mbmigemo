///|
/// Query state is local to the call; the validated dictionary is read-only.
pub fn query(dictionary : @dictionary.Dictionary, input : String) -> String {
  if input.is_empty() {
    return "(?!)"
  }
  let result = StringBuilder()
  for word in @romaji.segment(input) {
    let expansion = @romaji.expand(word)
    let candidates = expansion.candidates
    for reading in expansion.readings {
      candidates.append(dictionary.predictive_search(reading))
    }
    result.write_string(@pattern.alternatives(candidates))
  }
  result.to_string()
}
