---
title: "Implementing Web Crawler"
pubDate: 2025-05-29
description: ""
ogImage: "https://sunguoqi.com/me.png"
author: ""
image:
  url: "https://docs.astro.build/assets/rose.webp"
  alt: "The Astro logo on a dark background with a pink glow."
tags: []
---
In the past week, I implemented a simple and basic **web crawler** using _Go_. And I'm here to share how I did it.

![web crawler](../../assets/web-crawler.png)

### Web Crawler

Web crawler, is a bot or a program that periodically or just once, fetches the website. This can be done for various reasons,
either be creating a website ranking on your _search engine_ for better query result or for scraping the data from a website
.

In this blog, we will be implementing a very simple and easy **web crawler**, so let's get started.

### Setting up

Create a project folder, and set up your _Go_ using

```bash
go mod init github.com/[your-github-username]/webcrawler
```

And let's do the most important thing in the coding, that a person can do

```go
// main.go
package main

import "fmt"

func main() {
    fmt.Println("Hello world!")
}
```

Phewww, we have done the hardest part in our coding that is printing **Hello world** to the console.

### Normalize URL

Now, before fetching the website's content we want to create a way to normalize the url, so that
if we get multiple urls that are pointing to same location but have difference in protocol, or casing of the letters or
trailing slash or not.

We will be doing Test driven development(uncle bob will be happy...). Let's write a test case for this.

```go
// normalize_url_test.go
package main

import (
    "testing"

    "github.com/stretchr/testify/assert"
)

func TestNormalizeURL(t *testing.T) {
	expected := "blog.vikuuu.dev/path"

	url := "https://blog.vikuuu.dev/path"
	got, err := normalizeURL(url)
	assert.NoError(t, err)
	assert.Equal(t, expected, got)

	url = "http://blog.vikuuu.dev/path"
	got, err = normalizeURL(url)
	assert.NoError(t, err)
	assert.Equal(t, expected, got)

	url = "http://blog.vikuuu.dev/path/"
	got, err = normalizeURL(url)
	assert.NoError(t, err)
	assert.Equal(t, expected, got)

	url = "https://blog.vikuuu.dev/path/"
	got, err = normalizeURL(url)
	assert.NoError(t, err)
	assert.Equal(t, expected, got)

	expected = "vikuuu.github.com"
	url = "HTTPS://Vikuuu.github.com"
	got, err = normalizeURL(url)
	assert.NoError(t, err)
	assert.Equal(t, expected, got)

	expected = ""
	url = ""
	got, err = normalizeURL(url)
	assert.NoError(t, err)
	assert.Equal(t, expected, got)

	expected = "www.github.com/vikuuu"
	url = "http://www.github.com/Vikuuu"
	got, err = normalizeURL(url)
	assert.NoError(t, err)
	assert.Equal(t, expected, got)

	url = "://bankai.xl"
	got, err = normalizeURL(url)
	assert.Error(t, err)
}
```

Here I am using the `testify` package for testing. The test cases are pretty much simple, and
you can understand what we want from our function.

```go
// normalize_url.go
package main

import (
    "net/url"
    "strings"
)

func normalizeURL(rawURL string) (string, error) {
    parsedURL, err := url.Parse(rawURL)
    if err != nil {
        return "", err
    }

    fullPath := parsedURL.Host + parsedURL.Path
    fullPath := strings.ToLower(fullPath)
    fullPath := strings.TrimSuffix(fullPath, "/")

    return fullPath, nil
}
```

Run the test and you should pass the test cases.

```bash
❯ go test ./...
ok      github.com/Vikuuu/webcrawler    0.002s
```

### Get URLs from HTML

Suppose we got the HTML data, now we want to fetch all the links, that the HTML might have so that we can also crawl
those websites.

Let's write some test cases for that.

```go
// html_parse_test.go
package main

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestGetURLsFromHTML(t *testing.T) {
	htmlBody := `<html>
	<body>
		<a href="/path/one">
			<span>Some page</span>
		</a>
		<a href="https://other.com/path/one">
			<span>some other page</span>
		</a>
	</body>
</html>`
	inputUrl := "https://vikuuu.github.io"

	malformedHtml := `<html>
	<ch<bankai>>
	<body>
</htl`

	// Wrong raw base url provided
	wrongRawURL := "://bankai.com"
	_, err := getURLsFromHTML(htmlBody, wrongRawURL)
	assert.Error(t, err)

	// Malformed html body passed still no error should be returned
	_, err = getURLsFromHTML(malformedHtml, inputUrl)
	assert.NoError(t, err)

	// get the valid links out
	expected := []string{"https://vikuuu.github.io/path/one", "https://other.com/path/one"}
	got, err := getURLsFromHTML(htmlBody, inputUrl)
	assert.NoError(t, err)
	assert.Equal(t, expected, got)

	// malformed url in anchor tag
	htmlBody = `<html>
	<body>
		<a href="://other.com/path/one">
			<span>some other page</span>
		</a>
	</body>
</html>`
	got, err = getURLsFromHTML(htmlBody, inputUrl)
	assert.Zero(t, len(got))
}
```

Run the test and your test cases will fail, and that is what we want. In TDD we first write the test cases and run the
test to see them fail(what a sadist) and then write the functionality that the tests are testing for,
and then see them pass(now this is great).

Now, write the code for `getURLsFromHTML`.

```go
// html_parse.go
package main

import (
    "strings"

    "golang.org/x/net/html"
)

func getURLsFromHTML(htmlBody, rawBaseURL string) ([]string, error) {
    baseURL, err := url.Parse(rawBaseURL)
    if err != nil {
        return nil, err
    }
    htmlReader := strings.NewReader(htmlBody)

    doc, err := html.Parse(htmlReader)
    if err != nil {
        return nil, err
    }

    urls := []string{}
    for n := range doc.Descendants() {
        if n.Type == html.ElementNode && n.Data == "a" {
            attrs := n.Attr
            for _, attr := range attrs {
                if attr.Key == "href" {
                    href, err := url.Parse(attr.Val)
                    if err != nil {
                        fmt.Printf("couldn't parse href '%v': %v\n", attr.Val, err)
                        continue
                    }
                    resolvedUrl := baseURL.ResolveReference(href)
                    urls = append(urls, resolvedUrl.String())
                }
            }
        }
    }

    return urls, nil
}
```

In this function we are firstly normalizing the given base url.
We are creating the `io.Reader` on the html string data we get, because for parsing the HTML we are using
`golang.org/x/net/html` package, and in its `Parse` function it takes the `io.Reader` as input.

Then we traverse the _tree_ structure created by parsing the html and we specifically looking for
`a` tag, and `href` attribute inside it, if we get the `href` attribute in it we parse it
and resolve it against the base url of the HTML we are parsing, because sometime it may happen that the Url we get
is relative to the Url we are on.

We append the url and at last we return the urls slice.

Run the test and we will be passing all the test case.

### Get HTML

Now we want to fetch the HTML content of the given Url. For this we won't be writing the tests because this function
won't be a _pure_ function, because it will have some side effects, suppose we are fetching a website HTML now and
it gives us the data in certain format, but if we fetch it next day, it not a guarantee that we will get the same HTML
content that we got yesterday. We write test case for mostly _pure_ functions.

```go
//parse_html.go

import (
    // ...
    "net/http"
    "errors"
    "io"
    // ...
)

func getHTML(rawURL string) (string, error) {
    c := http.Client{
        Timeout: 15 * time.Second,
    }
    res, err := c.Get(rawURL)
    if err != nil {
        return "", err
    }
    defer res.Body.Close()

    // 400+ Status Code handled
    if res.StatusCode >= 400 {
        return "", errors.New(res.Status)
    }

    // Content-Type is not text/html
    contentType := res.Header.Get("content-type")
    if !strings.Contains(contentType, "text/html") {
        return "", errors.New("content type not 'text/html'")
    }

    body, err := io.ReadAll(res.Body)
    if err != nil {
        return "", err
    }

    return string(body), nil
}
```

With this we can get the HTML content of the Url we define.

### Crawl Web Page

Now is the time to create the functionality for crawling the pages.
We want that, we define a _start url_ and after that we start by crawling that page, and then extract all the links
and then crawl all those pages too.

We want to create concurrent crawlers that can crawl multiple pages simultaneously. For that we define a _struct_.

```go
// crawl.go
package main

import (
    "net/url"
    "sync"
)

type config struct {
	pages              map[string]int
	maxPages           int
	baseUrl            *url.URL
	mu                 *sync.Mutex
	concurrencyControl chan struct{}
	wg                 *sync.WaitGroup
}
```

In this `config` structure we added the

- pages: map that will count how many times a url is encountered.
- maxPages: max pages crawl limit, if we do not define this we might start crawling the whole web.
- baseUrl: the starting url we are provided with.
- mu: mutex for working with multiple threads
- concurrencyControl: this will tell us how many concurrent crawlers we want?
- wg: for not exiting early and waiting for all the processes to finish.

Now let's create a starting point from which all the crawling process will start.

```go
// crawl.go
func (cfg *config) crawl() {
    // Add new thread or goroutine in our case
    cfg.wg.Add(1)
    go func() {
        // with this we have aquired a place for our
        // goroutine to crawl the page.
        cfg.concurrencyControl <- struct{}{}
        cfg.crawlPage(cfg.baseUrl.String())
    }()

    // keep waiting for all the goroutines to finish
    cfg.wg.Wait()
    return
}
```

Now the function that will crawl the page and then recursively call itself to crawl the pages that it got from
crawling the previous page.

```go
// crawl.go
import (
    "log"
    "net/url"
)

func (cfg *config) crawlPage(rawCurrentURL string) {
    // indicate we are done, even in the case of preemtive return
    defer cfg.wg.Done()
    // freeing up our space to allow another goroutine to start the crawl if waiting.
    defer func() { <-cfg.concurrencyControl }()

    if len(cfg.pages) >= cfg.maxPages {
        // max limit reached, exit!
        return
    }

    parsedCurrUrl, err := url.Parse(rawCurrentURL)
    if err != nil {
        return
    }

    if cfg.baseUrl.Host != parsedCurrUrl.Host {
        // if we are on different host then we started with
        // then stop (you can change it if you want).
        return
    }

    nrmlCurrUrl, err := normalizeURL(rawCurrentURL)
    if err != nil {
		log.Printf("err normalizing url %s %s\n", rawCurrentURL, err)
    }

    isFirst := cfg.addPageVisit(nrmlCurrUrl)
    // if we have crawled the page, exit!
    if !isFirst {
        return
    }

    body, err := getHTML(rawCurrentURL)
    if err != nil {
        log.Printf("%s\n", err)
    }

    urls, err := getURLsFromHTML(body, rawCurrentURL)
    if err != nil {
        log.Printf("%s\n", err)
    }

    for _, url := range urls {
        cfg.wg.Add(1)
        go func(c string) {
            cfg.concurrencyControl <- struct{}{}
            cfg.crawlPage(c)
        }(url)
    }
}

func (cfg *config) addPageVisit(normalizedURL string) (isFirst bool) {
    _, ok := cfg.pages[normalizedURL]
    if !ok {
        cfg.pages[normalizedURL]++
        isFirst = true
    }
    return isFirst
}
```

With this we have written the logic of crawling the web page.

### Starting point

Now we just need to update the `main.go` which will take the the arguments using terminal.

```go
// main.go
package main

import (
    "fmt"
    "log"
    "net/url"
    "os"
    "strconv"
    "sync"
)

func main() {
    args := os.Args[1:]

    if len(args) < 1 {
        fmt.Println("no website provided")
        os.Exit(1)
    }

    rawUrl := args[0]
    // set the concurrency control limit
    mc, _ := strconv.Atoi(args[1])
    // set the max pages to crawl limit
    mp, _ := strconv.Atoi(args[2])

    parsedUrl, err := url.Parse(rawUrl)
    if err != nil {
        log.Fatalf("%s\n", err)
    }

    cfg := config{
		pages:              make(map[string]int),
		maxPages:           mp,
		baseUrl:            parsedUrl,
		mu:                 &sync.Mutex{},
		concurrencyControl: make(chan struct{}, mc),
		wg:                 &sync.WaitGroup{},
    }
    log.Printf("starting crawl of %s\n", rawUrl)
    cfg.crawl()

	fmt.Printf("=============================\n"+
		"  REPORT for %s\n"+
		"=============================\n", rawUrl)
	for k, v := range cfg.pages {
		fmt.Printf("Found %d internal links to %s\n", v, k)
	}
}
```

With this you can start your crawling with this command

```bash
go run . https://vikuuu.github.io/ 3 10
```

Be sure to add the log command to see everything in action or you might think that your program is stuck.

### Afterword

And voilaaa, with this we have our basic implementation of web crawler.

Until next time.

Code Link: [Github](https://github.com/Vikuuu/webcrawler)

Just know this,

> Reinvent the wheel, so that you can learn how to invent wheel
>
> -- a nobody
