---
title: "Basic Inverted Index"
pubDate: 2025-06-22
description: ""
ogImage: "https://sunguoqi.com/me.png"
author: ""
image:
  url: "https://docs.astro.build/assets/rose.webp"
  alt: "The Astro logo on a dark background with a pink glow."
tags: ["index", "go", "database", "information retrieval"]
---
![inverted index image](../../assets/index.png)

Inverted index is the data-structure that powers the most if not all the **Information Retrieval** mechanisms,
be it _web search engine_, _ElasticSearch_ (which is powered by _Apache Lucene_ under the hood written in Yava{Java}).
I started reading about it after getting to know that _ElasticSearch_ uses different type of database data indexing
from my senior. So I did what I wanted to do, starting reading a little about it and started to think about implementing
it (who wouldn't want to do that).

In this blog, I will be sharing how I created a _toy_ **Inverted Index** data-structure, and will(not) be creating a
simple parser for **Boolean Query** to retrieve the
relevant data that I want(maybe next time).

## What is Inverted Index

Heck, what the hell is _Information Retrieval_. Anything that would require us to find some piece of data from the ocean
of unstructured data from some small context. You searching anything on the web, the swarm of the unstructured data be
it good or bad (your luck man...) based on some keywords that you give to the search engine.

_Information Retrieval_ has been a critical part of human history(I don't know if it's that deep). Like you trying to
find a book on how to **Rizz a gal** from library, so you tell the description of what you are looking or some important
keywords. Using that either description or keyword, the librarian will get you the best book that might be available at
the library or what the librarian will think is the best.

Now, **Inverted Index** helps us to _structure_ those vast amount of _unstructured_ data, so that information retrieval
might be the most accurate according to the keywords provided.

How is Inverted Index structured?

Basically, the inverted index maps the word with the documents in which it is present.

```
+-----------+------+       +-------------+
|   word    | freq |       | document ID |
+-----------+------+       +-------------+
| bankai    |  2   |  ---> |  1 -> 2     |
| domain    |  1   |  ---> |  2          |
| expansion |  1   |  ---> |  2          |
+-----------+------+       +-------------+
```

Above is the diagram that I made to represent what I meant.

## Toy Inverted Index

So, first I want to have 2 strings, and I want to create an Inverted index on those. For doing so we have to firstly
process those string i.e., making them go through some kind of language processing and getting the output and then
creating an inverted index on that processed data.

Flow of code will look like this.

     DATA --> NLP(natural language processing) --> INDEXER

#### Data processing

Firstly, we will build our `tokenizer` that will tokenize the given input string stream.

```go
/*
tokenizer.go
*/

package main

import (
    "strings"
    "unicode"
)

type TokenType int

const (
    word TokenType = iota
    punct
    whitespace
)

type Token struct {
    Value string
    Type  TokenType
}

func isSeparator(r rune) bool {
    return unicode.IsSpace(r) || unicode.IsPunct(r)
}

func tokenize(input string) []Token {
    var token []Token

    var currTokenType TokenType
    var currTokenVal strings.Builder

    for _, r := range input {
        if isSeparator(r) {
            if currTokenType == word {
                tokens = append(tokens, Token{
                    Value: currTokenVal.String(),
                    Type:  currTokenType,
                })
                currTokenVal.Reset()
            }
            currTokenType = whitespace
            if unicode.IsPunct(r) {
                currTokenType = punct
            }
            tokens = append(tokens, Token{
                Value: string(r),
                Type:  currTokenType,
            })
        } else {
            if currTokenType != word {
                currTokenType = word
            }
            currTokenVal.WriteRune(r)
        }
    }

    if currTokenType == word {
        tokens = append(tokens, Token{
            Value: currTokenVal.String(),
            Type:  currTokenType,
        })
    }

    return tokens
}
```

With this we have created our `tokenizer` that will take a stream of string input and tokenize them.

Now, we will be `stemming` our stream of _tokens_ that we will get from our `tokenizer`.

```go
/*
stemmer.go
*/

package main

import (
    "strings"

    golem "github.com/aaaton/golem/v4"
    "github.com/aaaton/golem/v4/dicts/en"
)

// Initialize the stopwords with the english stopwords, you can ask the LLM to generate
// this for you. Map them to empty struct
// because empty struct are of size 0.
var stopwords = map[string]struct{}{
    // initialize here.
}

func removeStopWords(tokens []Token) []Token {
    result := []Token{}
    for _, token := range tokens {
        _, ok := stopwords.[token.Value]
        if !ok {
            result = append(result, token)
        }
    }
    return result
}

func removePunctAndSpace(tokens []Token) []Token {
    result := []Token{}
    for _, token := range tokens {
        if token.Type == word {
            result = append(result, token)
        }
    }
    return result
}

func lemmetizedTokens(tokens []Token) []Token {
    lemmer, err := golem.New(en.New())
    if err != nil {
        panic(err)
    }
    for i, token := range tokens {
        token.Value = lemmer.Lemma(token.Value)
        tokens[i] = token
    }
    return tokens
}

func stemmer(tokens []Token) []Token {
    for i, token := range tokens {
        tokens[i] = Token{
            Value: strings.ToLower(token.Value),
            Type:  token.Type,
        }
    }
    tokens = removePunctAndSpace(tokens)
    tokens = removeStopWords(tokens)

    return lemmetizedTokens(tokens)
}
```

We are firstly, initializing an `map`, that contains all the _English_ stop words. Stop words are words that themselves
do not add any meaning to a sentence for natural language processing. So we want to filter these words out, we
wouldn't want to _index_ words that in and of itself do not add any meaning to the document(let's save some precious space).

Then we **lemmetize** our word, now _lemmetization_ is the process of converting a word to its base form or grouping
different inflected forms of a word so they can be analyzed as a single item.
Example words _good_, _best_, _better_ can
be reduced to a single word _good_. By doing this we can index different word that would mean same thing using only a
single word.

#### Indexer

Now that we are done with our data-processing, we can go ahead and create our _indexer_.

```go
/*
indexer.go
*/

package main

import (
    "encoding/gob"
    "errors"
    "os"
    "path/filepath"
    "slices"
)

type IR struct {
    Index map[string][]int
}

func NewIR() *IR {
    return &IR{
        Index: make(map[string][]int),
    }
}

// save the data into a file, for persistant storage.
func (i *IR) serializer(indexPath string) {
    f, err := os.OpenFile(indexPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
    if err != nil {
        panic(err)
    }

    encoder := gob.NewEncoder(f)

    err = encoder.Encode(i)
    if err != nil {
        panic(err)
    }
}

// loads any data that might be already indexed.
func (i *IR) deserializer(indexFile string) {
    f, err := os.Open(indexFile)
    if err != nil {
        if errors.Is(err, os.ErrNotExist) {
            return
        }
        panic(err)
    }

    decoder := gob.NewDecoder(f)

    err = decoder.Decode(i)
    if err != nil {
        panic(err)
    }
}

func indexer(tokens []Token, docID int) *IR {
    cwd, err := os.Getwd()
    if err != nil {
        panic(err)
    }
    indexFile := filepath.Join(cwd, "invert.index")

    ir := NewIR()

    ir.deserializer(indexFile)

    for _, token := range tokens {
        list, found := ir.Index[token.Value]
        // if the word is not present in the index, then we add
        // it to the index, with docID it was found in and
        // go to next iteration
        if !found {
            ir.Index[token.Value] = []int{docID}
            continue
        }

        // check if the docID is present, if it not then add
        // the docID in the slice of docID's
        present := slices.Contains(list, docID)
        if !present {
            ir.Index[token.Value] = append(list, docID)
        }
    }

    ir.serializer(indexFile)

    return ir
}
```

The structure of the _Inverted Index_ is very simple, we are creating a `map` that will maps the word(string) to the
slice of int (acting as `docID`).

Now, we want to persist our index, so that if we want we can feed our _indexer_ data in multiple iteration. For this
I am using `encoding/gob` package, that encodes the go data structure so that transferring can become easy. We will
be saving this data to a file, we can do so because gob `encoder` and `decoder` uses the interface `io.Reader` and
`io.Writer` and we can get them by opening a file.

Then creating the _index_ is pretty easy, just loop over the token map them to the slice of `docID`.

And there you have it, your own toy **Inverted Index**.

#### Testing Indexer

Let's add some sample data for testing our indexer.

```go
/*
main.go
*/

package main

import (
	"flag"
    "fmt"
    "sort"
	"os"
)

func main() {
	flag.String("init", "", "Initialize the data and create an Inverted index.")

	flag.Parse()

	if len(os.Args) < 2 {
		flag.Usage()
		return
	}

	switch os.Args[1] {
	case "init":
		initializeData()
}


func initializeData() {
	inputs := []struct {
		ID   int
		Data string
	}{
		{
			ID:   1,
			Data: "I did enact Julius Caesar: I was killed i' the Capitol; Brutus killed me",
		},
		{
			ID:   2,
			Data: "So let it be with Caesar. The noble Brutus hath told you Caesar was ambitious",
		},
	}

	for _, input := range inputs {
		tokens := tokenize(input.Data)

		fmt.Println("Original input: ", input)
		fmt.Println("Tokenized output:")

		for i, token := range tokens {
			fmt.Printf("%d: %s (%d)\n", i+1, token.Value, token.Type)
		}

		stemmedTokens := stemmer(tokens)
		fmt.Println("Stemmed output:")

		for i, token := range stemmedTokens {
			fmt.Printf("%d: %s (%d)\n", i+1, token.Value, token.Type)
		}

		fmt.Println("Starting indexing the input.")
		ir := indexer(stemmedTokens, input.ID)
		fmt.Println("Finished indexing the input.")

		printSortedMap(ir)
	}
}

func printSortedMap(ir *IR) {
	fmt.Println("Printing the index.")

	keys := make([]string, 0, len(ir.Index))

	for key := range ir.Index {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	for _, k := range keys {
		fmt.Printf("word: %s, list: %v\n", k, ir.Index[k])
	}
}

```

Now, run the command

```bash
go run . init
```

And you would get this output at the last

```
Printing the index.
word: ambitious, list: [2]
word: brutus, list: [1 2]
word: caesar, list: [1 2]
word: capitol, list: [1]
word: enact, list: [1]
word: hath, list: [2]
word: julius, list: [1]
word: kill, list: [1]
word: let, list: [2]
word: noble, list: [2]
word: tell, list: [2]
```

## Afterwords

So, with this we have our toy _Inverted Index_ structure that can help us with _Information Retrieval_.

[Code link](https://github.com/Vikuuu/inverted-index)

Just know this,

> Reinvent the wheel, so that you can learn how to invent wheel
>
> -- a nobody

## References

- [Stanford Information Retrieval book](https://nlp.stanford.edu/IR-book/html/htmledition/a-first-take-at-building-an-inverted-index-1.html)
- [Simple Tokenizer in Golang](https://towardsdev.com/simple-tokenizer-in-golang-5163598a8079)
- [Data Serialization in Go](https://dev.to/canopassoftware/how-to-do-data-serialization-and-deserialization-in-golang-41mi)
