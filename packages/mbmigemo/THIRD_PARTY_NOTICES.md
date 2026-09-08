# Third-party notices

The romaji conversion and query segmentation logic, and the four conversion
tables used by the generated core, derive from C/Migemo 1.8.0, commit
`e780fcf8dfe59fe3266ca8676906a3cefa1683e8`, by MURAOKA Taro (KoRoN).

Source: https://github.com/koron/cmigemo/tree/e780fcf8dfe59fe3266ca8676906a3cefa1683e8

The upstream MIT license and copyright notice are included in
`dist/LICENSE-CMIGEMO`. Table hashes and generation instructions are recorded
in the source repository under `src/romaji/data/provenance.json` and
`scripts/generate-conversions.mjs`.

MoonBit core library code may be included by the compiler in generated outputs.
It is licensed under Apache-2.0. Its license is included as
`dist/LICENSE-MOONBIT-CORE`.

The library does not embed a Migemo dictionary. Callers supply dictionary
bytes and retain responsibility for the license of their chosen dictionary.
This notice does not set a license for mbmigemo's own code.
