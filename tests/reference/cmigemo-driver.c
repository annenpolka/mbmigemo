// Test-only adapter: hex UTF-8 records avoid the upstream CLI's 255-byte limit
// and preserve newlines. Embedded NUL is outside the C string oracle's domain.
#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "migemo.h"

static int nibble(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'a' && c <= 'f') return c - 'a' + 10;
    return -1;
}

int main(int argc, char **argv) {
    if (argc != 6) {
        fprintf(stderr, "expected dictionary and four conversion tables\n");
        return 2;
    }
    migemo *m = migemo_open(NULL);
    if (!m) return 2;
    // Explicitly load every table: migemo_open(path) ignores missing tables.
    for (int i = 1; i <= 5; i++) {
        if (migemo_load(m, i, argv[i]) != i) {
            fprintf(stderr, "cannot load reference input: %s\n", argv[i]);
            migemo_close(m);
            return 2;
        }
    }
    const char *operators[] = {"|", "(", ")", "[", "]", ""};
    for (int i = 0; i < 6; i++) {
        if (!migemo_set_operator(m, i, (const unsigned char *)operators[i])) {
            migemo_close(m);
            return 2;
        }
    }
    // Escape literal JS regexp syntax. JS adapter changes the literal escape
    // \- to \x2d, which is valid both inside and outside a /u character class.
    migemo_set_escape_chars(m, (const unsigned char *)"\\.*+?^$/{[()|]}-");
    char *line = NULL;
    size_t capacity = 0;
    ssize_t length;
    int result = 0;
    while ((length = getline(&line, &capacity, stdin)) != -1) {
        if (length && line[length - 1] == '\n') length--;
        if (length == 0 || length % 2) { result = 2; break; }
        size_t size = (size_t)length / 2;
        unsigned char *query = malloc(size + 1);
        if (!query) { result = 2; break; }
        for (size_t i = 0; i < size; i++) {
            int high = nibble(line[i * 2]), low = nibble(line[i * 2 + 1]);
            if (high < 0 || low < 0 || (high == 0 && low == 0)) {
                result = 2;
                break;
            }
            query[i] = (unsigned char)(high * 16 + low);
        }
        query[size] = 0;
        if (result) { free(query); break; }
        unsigned char *pattern = migemo_query(m, query);
        free(query);
        if (!pattern) { result = 2; break; }
        for (const unsigned char *p = pattern; *p; p++) printf("%02x", *p);
        putchar('\n');
        migemo_release(m, pattern);
    }
    if (ferror(stdin) || ferror(stdout)) result = 2;
    if (result) fprintf(stderr, "reference protocol/query failed\n");
    free(line);
    migemo_close(m);
    return result;
}
