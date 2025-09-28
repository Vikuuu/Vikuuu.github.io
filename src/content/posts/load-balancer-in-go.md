---
title: "Implementing Load Balancer"
pubDate: 2025-09-26
description: "Implementation of Load Balancer with the random weighted selection policy in Go."
author: "Guts Thakur"
tags: ["load-balancer", "go", "system"]
---

![Gopher managing loads](../../assets/load-balancer.jpg)

This past week I wanted to build something, so I had a thought why not 
try the `Load Balancer`. Well what is a *Load Balancer*? 
Load Balancer sits between the client and our mutliple servers, and routes the client's
request to one of the multiple servers based on defined factors.

There are multiple selection policy for the load balancing like

- Round Robin
- Weighted Selection
- Least Connection, and many more.

But, in this we will go with **Weighted Selection Policy**.

## Reading from the configuration file

We will be reading from the YAML file to make this implementation a little configurable, if we want to use the real
servers.

```go
// reader.go
package main

import (
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

func readYAML(pwd string) ([]string, error) {
	configFile := filepath.Join(pwd, "load.yaml")
	f, err := os.ReadFile(configFile)
	if err != nil {
		return nil, err
	}

	server := &struct {
		Data []string `yaml:"serve"`
	}{}

	err = yaml.Unmarshal(f, server)
	if err != nil {
		return nil, err
	}

	return server.Data, nil
}
```

In this we are looking in the current working directory from where the code is being run for the filename `load.yaml`.
Read the file and pass that `[]byte` data to the yaml unmarshler. Here we are creating a struct to which the yaml unmarshler will update the data in.
Then return the slice of string data.

Here we are assuming that the user will enter the list of server in this format

```yaml
serve:
  - name_of_server url_of_server weight_of_server
  - name_of_server url_of_server weight_of_server
```

For example, this is my `load.yaml` file's content.

```yaml
# load.yaml
serve: 
  - name1 https://google.com 10
  - name2 https://bing.com 20
  - name3 https://duckduckgo.com 100
```

By this, I will be redirecting the requests to the search engines.

## Load Balancer

Firstly, we will be defining the `Server` struct and it's method.

```go
// load_balancer.go

package main

import (
    "log"
    "net/http"
    "net/http/httputil"
    "net/url"
    "strconv"
    "strings"
)

type Server struct {
    name string
    weight int
    addr string
    proxy *httputil.ReverseProxy
}

func NewServer(name, addr string, weight int) *Server {
    serverUrl, err := url.Parse(addr)
    if err != nil {
        panic(err)
    }

    return &Server{
        name: name,
        weight: weight,
        addr: addr,
        proxy: httputil.NewSingleHostReverseProxy(serverUrl),
    }
}
```

We define the `Server` structure that will hold, the server name, server's weight, addr, and proxy.

The proxy here is the Reverse proxy, that will be the one that will receive the client's request, the we will route the 
request to the other desired server's.
The reverse proxy help's in hiding the location of our server's and make it seem for the user that we are getting the result from 
the single server.

Now the `Server` struct method.

```go
func (s *Server) IsAlive() bool {
    return true
}

func (s *Server) Serve(w http.ResponseWriter, r *http.Request) {
    s.proxy.ServeHTTP(w, r)
}
```

Now, we want the `LoadBalancer` structure that will hold 
1) the current port to which the request will come,
2) the slice of `Server`, and
3) the `Set` of down servers

We will read a `Read` method on the `LoadBalancer` that will 
read the strings that will be given to us by the *YAML reader*
we will parse it and create the `Server` struct and it to our
servers slice.

The `GetNextAvailableServer` method, that will get the next server
available for consuming the request based on our selection policy.

The `ServeProxy` method that will route the request to the server.

Lastly, the important method `CheckHealth` that will check for 
the availability of the server, and vice-versa.

```go
type LoadBalancer struct { 
    port    string
    servers []*Server

    // The set implementation here, that I have a blog for it
    // you can go read it
    down    *Set
}

func NewLoadBalancer(port string) *LoadBalancer {
    return &LoadBalancer{port: port}
}

func (lb *LoadBalancer) Read(servers []string) (int, error) {
    for _, s := range servers {
        sPart := strings.Split(s, " ")
        weight, err := strconv.Atoi(sPart[2])
        if err != nil {
            panic(err)
        }
        server := NewServer(sPart[0], sPart[1], weight)

        lb.servers = append(lb.servers, server)
    }    
    return len(lb.servers), nil 
}

func (lb *LoadBalancer) GetNextAvailableServer() *Server {
    return weightedSelection(lb.servers)
}

func (lb *LoadBalancer) ServeProxy(w http.ResponseWriter, r *http.Request) {
    server := lb.GetNextAvailableServer()
    log.Println("forwarding request to address ", server.addr)
    server.Serve(w, r)
}

func (lb *LoadBalancer) CheckHealth() {
    // Check for any servers that might be down?
    for i, server := range lb.servers {
        if !server.IsAlive() {
            lb.down = append(lb.down, server)
            prev := lb.servers[:i]
            next := lb.servers[i+1:]
            copy(lb.servers, prev)
            lb.servers = append(lb.servers, next...)
        }
    }

    // Check for down servers, if they are up?
    for i, server := range lb.down.Iter() {
        if server.IsAlive() {
            lb.down.Remove(server)
            // add if not present in the slice, well it should
            // not be present, but we should make sure.
            lb.servers = append(lb.servers, server)
        }
    }
}
```

## Selection Policy

Let's get into the main juicy part. The selection policy, which **very simple**.
I don't know if this is correct or not, but this what I had in the mind.

So as I told in the introduction of the blog, we will be using 
the weighted random selection policy. 
The implemetation of the policy is very simple.

The Idea is this we have a straight area, with the area marked 
on it that will denote the weight, we throw the stone and
where the stone will land we will use that server. For example,

```text
    A         B                         C
 |-----|-------------|-----------------------------------|
   10        30                        50
```

Suppose when we throw the stone it landed on 38

```text
    A         B                         C
 |-----|-------------|-----------------------------------|
                        ^
                        |
                      Stone (38)
```

It landed on the `C` area, so we will use the *Server* `C`
As we can see, the weight of `C` is far greater than any other
as so the chances of the *stone* landing in that area.

Let's get into this selection policy implementation.

```go
// selection_policy.go
package main

import "math/rand"

func weightedSelection(items []*Server) *Server {
	totalWeight := 0
	for _, item := range items {
		totalWeight += item.weight
	}

	r := rand.Intn(totalWeight)

	cursor := 0
	for _, item := range items {
		cursor += item.weight
		if cursor >= r {
			return item
		}
	}

    // The code should not come here, but if it does
    // then we select the random server from the 
    // slice.
	r = rand.Intn(len(items))
	return items[r]
}
```

Simple.

## Using the Load Balancer

Now, for the `main` function that will be using this.

```go
// main.go
package main

import (
	"fmt"
	"net/http"
	"os"
	"time"
)

func main() {
	pwd, err := os.Getwd()
	if err != nil {
		fmt.Fprint(os.Stderr, err)
		return
	}

	lb := NewLoadBalancer("8000")

	servers, err := readYAML(pwd)
	if err != nil {
		fmt.Fprint(os.Stderr, err)
		return
	}

	n, err := lb.Read(servers)
	if err != nil {
		fmt.Fprint(os.Stderr, err)
		return
	}

	handleRedirect := func(w http.ResponseWriter, r *http.Request) { lb.ServeProxy(w, r) }
	http.HandleFunc("/", handleRedirect)
	fmt.Println("serving request at localhost:", lb.port)

	// bankai
	go backgroundProcess(lb)

	// start listening for request
	http.ListenAndServe(":"+lb.port, nil)
}

func backgroundProcess(lb *LoadBalancer) {
	time.Sleep(5 * time.Second)
	lb.checkHealth()
}
```

Here, we are creating a new load balancer of port *8000*, reading the YAML configuration file, parsing it.
Creating a Redirect function and storing it in a variable.
Any request that will come to our server, will we handled by this function.

We also run a background *gorouting* that will run every 5 seconds checking for the server's availability. For now we are only returning the `true`, but in real environment we will be checking by making a request to that server.

Then, listen for the request indefinately.

Let's test it. In one terminal run the code, and in other make
the curl request to the localhost.

```bash
curl localhost:8000
```
... 

```bash
serving request at localhost: 8000
2025/09/28 21:40:09 forwarding request to address  https://duckduckgo.com
2025/09/28 21:40:11 forwarding request to address  https://duckduckgo.com
2025/09/28 21:40:12 forwarding request to address  https://duckduckgo.com
2025/09/28 21:40:13 forwarding request to address  https://duckduckgo.com
2025/09/28 21:40:13 forwarding request to address  https://duckduckgo.com
2025/09/28 21:40:14 forwarding request to address  https://duckduckgo.com
2025/09/28 21:40:14 forwarding request to address  https://duckduckgo.com
2025/09/28 21:40:15 forwarding request to address  https://duckduckgo.com
2025/09/28 21:40:15 forwarding request to address  https://bing.com
2025/09/28 21:40:16 forwarding request to address  https://duckduckgo.com
2025/09/28 21:40:16 forwarding request to address  https://google.com
2025/09/28 21:40:22 forwarding request to address  https://google.com
2025/09/28 21:40:22 forwarding request to address  https://duckduckgo.com
```

As you can see, I gave the `duckduckgo` the highest weight, so we 
got routed mostly to that only.

## Afterword

In this blog post, we create a **Load Balancer** using the 
weighted random selection policy.

Thanks for reading and do let me know what I did correct or 
what I did wrong, would love to hear it.

## References

- [Youtube video by Akhil Sharma](https://youtu.be/ZSDYx9eOiqo?si=At5qksApbUjdx2_J)
- [Weighted Random Selection Algorithm](https://dev.to/jacktt/understanding-the-weighted-random-algorithm-581p)
