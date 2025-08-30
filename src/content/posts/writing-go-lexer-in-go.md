---
title: "Writing Go lexer in Go"
pubDate: 2024-11-12
description: ""
ogImage: "https://sunguoqi.com/me.png"
author: "Astro Learner"
image:
  url: "https://docs.astro.build/assets/rose.webp"
  alt: "The Astro logo on a dark background with a pink glow."
tags: []
---
![gopher image](https://miro.medium.com/v2/resize:fit:750/format:webp/1*YFGCnQTkFcGioPUGxZaAoA.jpeg)

## Introduction

Learning about lexical analysis from a high-level perspective might seem straightforward. However, when it comes to actually implementing it, things can quickly get confusing (at least, that’s been my experience!). This article is an attempt to delve deeper into lexing — understanding its inner workings, nuances, and practical implementation in Go. Hopefully, you’ll find something helpful here too.

## What is Lexical Analysis?

Lexical analysis (also called lexing or tokenization) is the process of breaking down a large block of text — in this case, a program — into smaller, recognizable chunks called tokens. Think of it as identifying individual “words” in a sentence. Each token can represent keywords, identifiers, symbols, or other elements that form the structure of a programming language.

Lexical analysis doesn’t aim to understand the meaning of the code. Instead, it’s an initial step to organize the code into tokens that can be further analyzed by a parser or evaluator. Here, we’ll walk through building a simple lexer in Go.

## Writing a lexer in Go

In this article, we’ll create a lexer specifically to parse Go’s `struct` syntax. We’ll start with a small example to get an idea of what we want to lex.

### *Example Input*

Consider the following go snippet.
```go
package main

type users struct {
    ID int
    Name string
    IsMember bool
}
```

We want our lexer to tokenize this code. But before we can write our lexer, let’s define what “tokens” we’re dealing with.

### *Defining Tokens*

Tokens represent the smallest meaningful elements of the code, such as keywords, data types, identifiers, and symbols. We’ll define our tokens in a Go file called `token.go`.

```go
package parser

type TokenType string

const (
    // Special tokens
    ILLEGAL = "ILLEGAL"
    EOF     = "EOF"

    // Literals
    IDENT = "IDENT"

    // Misc characters
    ASTERISK = "*"
    COMMA    = ","
    LBRACE   = "{"
    RBRACE   = "}"
    LPAREN   = "("
    RPAREN   = ")"

    // Keywords
    TYPE    = "TYPE"
    STRUCT  = "STRUCT"
    PACKAGE = "PACKAGE"

    // Data Types
    INT    = "INT"
    STRING = "STRING"
    BOOL   = "BOOL"
)

type Token struct {
    Type    TokenType
    Literal string
}

var keywords = map[string]TokenType{
    "type":    TYPE,
    "struct":  STRUCT,
    "package": PACKAGE,
    "int":     INT,
    "string":  STRING,
    "bool":    BOOL,
}
```

Here, we define constants for various tokens. The `Token` struct contains a token type and a literal value. The `keywords` map helps in identifying Go-specific keywords and data types.

### *Implementing the Scanner.*

The purpose of `scanner.go` is to **read through the input code one character at a time** and identify small pieces of it, called **tokens**. These tokens will be basic building blocks (like keywords, identifiers, braces, etc.) that will make it easier to analyze and understand the structure of the code later. Here's how it achieves this:

1. **Character-by-Character Scanning:**

    - `scanner` reads the code one character at a time.
    - It keeps track of its current position `(position)` , next position `(readPosition)` , and the current character `(ch)`.

2. **Tokenizing Individual Elements:**

    - Each time `NextToken()` is called, the scanner determines what kind of token it’s looking at. It uses the character in `ch` to decide if it's a specific symbol (like `{` or `}`), a keyword (like `package`), an identifier (like variable names), or an integer.
    - The `NextToken()` method uses helper functions, `readChar` that advances the scanner by reading the next character, `skipWhitespace` that skips spaces, tabs, and newlines, lastly `readIdentifier` and `readNumber` that capture sequences of letters(identifier/keywords) or numbers, respectively.

3. **Token Creation:**
    - Depending on what it reads, the scanner creates a `Token` with a `Type` and `Literal` (actual text value).
    - For example, if it reads `{`, it creates a token with `Type: LBRACE` and `Literal: "{"`.

4. **Basic Error Handling:**

    - If the scanner encounters a character it doesn’t recognize, it returns a token of type `ILLEGAL`.

The `scanner.go` file serves as the **foundation** of lexical analysis. It’s responsible for breaking the input code into recognizable pieces, which will then be used by the lexer.go for further processing.

```go
package parser

type Scanner struct {
    input        string
    position     int  // current position in input
    readPosition int  // current reading position
    ch           byte // current character
}

// NewScanner creates a new instance of Scanner
func NewScanner(input string) *Scanner {
    s := &Scanner{input: input}
    s.readChar() // Initialize first character
    return s
}

// readChar advances the scanner and updates the current character
func (s *Scanner) readChar() {
    if s.readPosition >= len(s.input) {
        s.ch = 0
    } else {
        s.ch = s.input[s.readPosition]
    }
    s.position = s.readPosition
    s.readPosition++
}

// NextToken generates the next token from input
func (s *Scanner) NextToken() Token {
    var tok Token
    s.skipWhitespace()

    switch s.ch {
    case '{':
        tok = Token{Type: LBRACE, Literal: string(s.ch)}
    case '}':
        tok = Token{Type: RBRACE, Literal: string(s.ch)}
    case 0:
        tok = Token{Type: EOF, Literal: ""}
    default:
        if isLetter(s.ch) {
            literal := s.readIdentifier()
            tokType := LookupIdent(literal)
            tok = Token{Type: tokType, Literal: literal}
            return tok
        } else if isDigit(s.ch) {
            literal := s.readNumber()
            tok = Token{Type: INT, Literal: literal}
            return tok
        } else {
            tok = Token{Type: ILLEGAL, Literal: string(s.ch)}
        }
    }
    s.readChar()
    return tok
}
```

#### *Testing the Scanner*

To ensure our lexer correctly tokenizes input, we’ll create tests.

```go
package parser

import (
    "testing"
)

func TestNextToken(t *testing.T) {
    input := `package main

    type users struct {
        ID int
        Name string
        IsActive bool
    }
    `

    tests := []struct {
        expectedType    TokenType
        expectedLiteral string
    }{
        {PACKAGE, "package"},
        {IDENT, "main"},
        {TYPE, "type"},
        {IDENT, "users"},
        {STRUCT, "struct"},
        {LBRACE, "{"},
        {IDENT, "ID"},
        {INT, "int"},
        {IDENT, "Name"},
        {STRING, "string"},
        {IDENT, "IsActive"},
        {BOOL, "bool"},
        {RBRACE, "}"},
        {EOF, ""},
    }

    scanner := NewScanner(input)

    for i, tt := range tests {
        tok := scanner.NextToken()

        if tok.Type != tt.expectedType {
            t.Fatalf("tests[%d] - tokentype wrong. expected=%q, got=%q", i, tt.expectedType, tok.Type)
        }

        if tok.Literal != tt.expectedLiteral {
            t.Fatalf("tests[%d] - literal wrong. expected=%q, got=%q", i, tt.expectedLiteral, tok.Literal)
        }
    }
}
```

### *Building the Lexer*

The purpose of `lexer.go` is to **orchestrate the tokenization process** with a bit more control, allowing for **backtracking** and other parser-level functionalities. Here's what it's doing:

1. **Buffering for Backtracking:**
    - `Lex` (lexer) has a buffer for tokens (`buf`), allowing it to store one token in case it needs to go back (known as "backtracking"). This feature is helpful when parsing, as some tokens may need to be checked multiple times to confirm they are correctly processed.

2. **Coordination with the Scanner:**
    - The lexer uses the scanner to get tokens via `nextToken()`.
    - This allows the lexer to **step through tokens** as it builds a more structured representation of the code.

3. **Token Management:**
    - `nextToken()`: Retrieves the next token, either from the buffer (if available) or directly from the scanner.
    - `unscan()`: Allows the lexer to "push back" a token into the buffer, effectively enabling it to revisit a token if needed.

4. **Higher-Level Parsing Interface:**

    - `Lexer()` in the lexer goes through each token produced by nextToken() until reaching the end of the file (EOF).
    - By handling token organization in this structured way, the lexer provides a foundation for interpreting the tokenized code and converting it into an **intermediate form** ready for parsing.

In essence, `lexer.go` is a **layer on top of the scanner** that adds token management features, enabling backtracking and providing an interface to walk through the tokenized code systematically. This structure is crucial as the next step (a full parser) will need to analyze and interpret tokens, possibly revisiting them, to correctly understand the overall code structure.

```go
package parser

type Lexer struct {
    s   *Scanner
    buf struct {
        tok Token
        n   int
    }
}

// NewLexer creates a new instance of Lexer
func NewLexer(s *Scanner) *Lexer {
    return &Lexer{s: s}
}

func (p *Lexer) Lex() {
    for {
        tok := p.nextToken()
        if tok.Type == EOF {
            break
        }
    }
}

// nextToken retrieves the next token
func (p *Lexer) nextToken() Token {
    if p.buf.n != 0 {
        p.buf.n = 0
        return p.buf.tok
    }

    tok := p.s.NextToken()
    p.buf.tok = tok
    return tok
}
```

#### Testing the Lexer

```go
package parser

import (
    "testing"
)

func TestLexer(t *testing.T) {
    input := `package main

    type users struct {
        ID int
        Name string
        IsActive bool
    }
    `

    tests := []Token{
        {Type: PACKAGE, Literal: "package"},
        {Type: IDENT, Literal: "main"},
        {Type: TYPE, Literal: "type"},
        {Type: IDENT, Literal: "users"},
        {Type: STRUCT, Literal: "struct"},
        {Type: LBRACE, Literal: "{"},
        {Type: IDENT, Literal: "ID"},
        {Type: INT, Literal: "int"},
        {Type: IDENT, Literal: "Name"},
        {Type: STRING, Literal: "string"},
        {Type: IDENT, Literal: "IsActive"},
        {Type: BOOL, Literal: "bool"},
        {Type: RBRACE, Literal: "}"},
        {Type: EOF, Literal: ""},
    }

    scanner := NewScanner(input)
    lexer := NewLexer(scanner)

    for i, expected := range tests {
        tok := lexer.nextToken()
        if tok.Type != expected.Type {
            t.Fatalf("tests[%d] - tokentype wrong. expected=%q, got=%q", i, expected.Type, tok.Type)
        }
        if tok.Literal != expected.Literal {
            t.Fatalf("tests[%d] - literal wrong. expected=%q, got=%q", i, expected.Literal, tok.Literal)
        }
    }
}
```

With this, we have a basic lexer that can tokenize Go struct syntax.

In summary, `scanner.go` and `lexer.go` play essential roles in transforming raw code into a structured series of tokens, laying the groundwork for building a complete parser. `scanner.go` performs the detailed work of reading and identifying individual characters, while `lexer.go` adds higher-level control, like backtracking and token management, to make parsing more flexible and powerful. Together, they act as the first step in interpreting code, converting raw text into a form that can be further analyzed and eventually executed or compiled.

Understanding these files is crucial for anyone interested in building parsers, compilers, or interpreters, as they highlight the process of breaking down and managing code syntax. With a solid scanner and lexer in place, the next stages of parsing and building an abstract syntax tree become significantly easier, unlocking the potential for language processing and custom compilers. Whether you’re working with Go or another language, mastering these foundational components is key to designing robust and efficient language tools.
